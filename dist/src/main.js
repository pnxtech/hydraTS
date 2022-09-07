"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Hydra = void 0;
const events_1 = __importDefault(require("events"));
const util_1 = __importDefault(require("util"));
const redis_1 = require("redis");
const network_1 = require("./lib/network");
const umfmessage_1 = require("./lib/umfmessage");
const uuid_1 = require("uuid");
// let HYDRA_REDIS_DB = 0;
// const MAX_ENTRIES_IN_HEALTH_LOG = 64;
const ONE_SECOND = 1000; // milliseconds
const ONE_WEEK_IN_SECONDS = 604800;
const PRESENCE_UPDATE_INTERVAL = ONE_SECOND;
const HEALTH_UPDATE_INTERVAL = ONE_SECOND * 5;
const KEY_EXPIRATION_TTL = 3; // three seconds
// const KEYS_PER_SCAN = '100';
/**
 * Hydra class
 * @note: Uses https://redis.js.org/ for Redis communication
 */
class Hydra extends events_1.default {
    /**
     * @name constructor
     */
    constructor() {
        super();
        this.redisPreKey = 'hydra:service';
        this.mcMessageKey = 'hydra:service:mc';
        this.net = new network_1.Network();
        this.mcMessageChannelClient = null;
        this.mcDirectMessageChannelClient = null;
        // private publishChannel = null;
        this.presenceTimerInteval = null;
        this.healthTimerInterval = null;
        this.updatePresence = this.updatePresence.bind(this);
        this.updateHealthCheck = this.updateHealthCheck.bind(this);
    }
    /**
     * @name init
     * @summary Initialize Hydra
     * @param config IHydraConfig
     */
    init(config) {
        return __awaiter(this, void 0, void 0, function* () {
            this.config = config;
            this.client = (0, redis_1.createClient)({
                url: this.config.redis.url
            });
            this.instanceID = (0, uuid_1.v4)().replace(RegExp('-', 'g'), '');
            this.client.on('error', (err) => console.log('Hydra Redis Client Error', err));
            this.client.on('connect', () => console.log('HydraRedis Client Connected'));
            this.client.on('ready', () => console.log('HydraRedis Client Ready'));
            this.client.on('reconnecting', () => console.log('HydraRedis Client Reconnecting'));
            this.client.on('end', () => console.log('HydraRedis Client End'));
            this.config.serviceIP = yield this.net.getServiceIP(this.config);
            yield this.client.connect();
        });
    }
    /**
     * @name updatePresence
     * @summary Update service presence in Redis
     */
    updatePresence() {
        return __awaiter(this, void 0, void 0, function* () {
            const entry = JSON.stringify({
                serviceName: this.serviceName,
                serviceDescription: this.serviceDescription,
                version: this.config.serviceVersion,
                instanceID: this.instanceID,
                updatedOn: this.timestamp,
                processID: process.pid,
                ip: this.config.serviceIP,
                port: this.config.servicePort,
                hostName: this.net.hostname
            });
            if (entry && !this.client.closing) {
                yield this.client.MULTI()
                    .SET(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:presence`, this.instanceID, {
                    EX: KEY_EXPIRATION_TTL,
                    NX: true
                })
                    .HSET(`${this.redisPreKey}:nodes`, this.instanceID, entry)
                    .EXEC();
            }
        });
    }
    /**
     * @name updateHealthCheck
     * @summary Update health check info
     */
    updateHealthCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            const entry = Object.assign({
                updatedOn: this.timestamp
            }, this.getHealth());
            yield this.client.MULTI()
                .SET(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health`, JSON.stringify(entry), {
                EX: KEY_EXPIRATION_TTL,
                NX: true
            })
                .EXPIRE(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health:log`, ONE_WEEK_IN_SECONDS)
                .EXEC();
        });
    }
    /**
     * @name getHealth
     * @summary Retrieve server health info.
     * @return {object} obj - object containing server info
     */
    getHealth() {
        let lines = [];
        let keyval = [];
        const memMap = {};
        let memory = util_1.default.inspect(process.memoryUsage());
        memory = memory.replace(/[ {}.|\n]/g, '');
        lines = memory.split(',');
        lines.forEach((line) => {
            keyval = line.split(':');
            memMap[keyval[0]] = Number(keyval[1]);
        });
        const uptimeInSeconds = process.uptime();
        return {
            serviceName: this.serviceName,
            instanceID: this.instanceID,
            hostName: this.net.hostname,
            sampledOn: this.timestamp,
            processID: process.pid,
            architecture: process.arch,
            platform: process.platform,
            nodeVersion: process.version,
            memory: memMap,
            uptimeSeconds: uptimeInSeconds.toFixed(2)
        };
    }
    /**
     * @name createMessage
     * @param msg
     * @returns object
     */
    createMessage(msg) {
        const umfMsg = new umfmessage_1.UMFMessage();
        umfMsg.createMessage(msg);
        return umfMsg.toShort();
    }
    /**
     * @name registerService
     * @summary Register a service with Hydra
     * @returns
     */
    registerService() {
        return __awaiter(this, void 0, void 0, function* () {
            const serviceEntry = JSON.stringify({
                serviceName: this.config.serviceName,
                type: this.config.serviceType,
                registeredOn: this.timestamp
            });
            yield this.client.SET(`${this.redisPreKey}:${this.config.serviceName}:service`, serviceEntry);
            // Setup service message channels
            this.mcMessageChannelClient = this.cloneRedisClient();
            this.mcMessageChannelClient.connect();
            this.mcMessageChannelClient.subscribe(`${this.mcMessageKey}:${this.config.serviceName}`);
            this.mcMessageChannelClient.on('message', (_channel, message) => {
                const msg = JSON.parse(message);
                if (msg) {
                    this.emit('message', this.createMessage(msg));
                }
            });
            this.mcDirectMessageChannelClient = this.cloneRedisClient();
            this.mcDirectMessageChannelClient.connect();
            this.mcDirectMessageChannelClient.subscribe(`${this.mcMessageKey}:${this.config.serviceName}:${this.instanceID}`);
            this.mcDirectMessageChannelClient.on('message', (_channel, message) => {
                const msg = JSON.parse(message);
                if (msg) {
                    this.emit('message', this.createMessage(msg));
                }
            });
            // Schedule periodic updates
            this.presenceTimerInteval = setInterval(this.updatePresence, PRESENCE_UPDATE_INTERVAL);
            this.healthTimerInterval = setInterval(this.updateHealthCheck, HEALTH_UPDATE_INTERVAL);
            // Update presence immediately without waiting for next update interval.
            this.updatePresence();
            return {
                serviceName: this.serviceName,
                serviceIP: this.serviceIP,
                servicePort: this.servicePort
            };
        });
    }
    /**
     * @name _getQueuedMessage
     * @summary retrieve a queued message
     * @param {string} serviceName who's queue might provide a message
     * @return {promise} promise - resolving to the message that was dequeued or a rejection.
     */
    getQueuedMessage(serviceName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.client.RPOPLPUSH(`${this.redisPreKey}:${serviceName}:mqrecieved`, `${this.redisPreKey}:${serviceName}:mqinprogress`);
        });
    }
    /**
     * @name queueMessage
     * @summary Queue a message
     * @param {object} message - UMF message to queue
     * @return {promise} promise - resolving to the message that was queued or a rejection.
     */
    queueMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            const msg = this.createMessage(message);
            const parsedRoute = (0, umfmessage_1.parseRoute)(msg.to);
            if (parsedRoute.error) {
                throw new Error(parsedRoute.error);
            }
            const serviceName = parsedRoute.serviceName;
            yield this.client.LPUSH(`${this.redisPreKey}:${serviceName}:mqrecieved`, JSON.stringify(msg));
            return message;
        });
    }
    /**
     * @name _markQueueMessage
     * @summary Mark a queued message as either completed or not
     * @param {object} message - message in question
     * @param {boolean} completed - (true / false)
     * @param {string} reason - if not completed this is the reason processing failed
     * @return {promise} promise - resolving to the message that was dequeued or a rejection.
     */
    markQueueMessage(message, completed, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            let strMessage = JSON.stringify(message);
            yield this.client.LREM(`${this.redisPreKey}:${this.serviceName}:mqinprogress`, -1, strMessage);
            if (message.bdy) {
                message.bdy.reason = reason || 'reason not provided';
            }
            else if (message.body) {
                message.body.reason = reason || 'reason not provided';
            }
            if (completed) {
                return message;
            }
            strMessage = JSON.stringify(message);
            return yield this.client.RPUSH(`${this.redisPreKey}:${this.serviceName}:mqincomplete`, strMessage);
        });
    }
    /**
     * @name shutdown
     * @summary Shutdown Hydra
     */
    shutdown() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.presenceTimerInteval) {
                clearInterval(this.presenceTimerInteval);
            }
            if (this.healthTimerInterval) {
                clearInterval(this.healthTimerInterval);
            }
            yield this.client.MULTI()
                .EXPIRE(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health`, KEY_EXPIRATION_TTL)
                .EXPIRE(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health:log`, ONE_WEEK_IN_SECONDS)
                .EXEC();
            yield this.client.DEL(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:presence`);
            yield Promise.all([
                yield this.mcMessageChannelClient.quit(),
                yield this.mcDirectMessageChannelClient.quit(),
                // this.publishChannel.quit(),
                yield this.client.QUIT()
            ]);
        });
    }
    /**
     * @name timestamp
     * @summary Retrieve an ISO 8601 timestamp.
     * @return {string} timestamp - ISO 8601 timestamp
     */
    get timestamp() {
        return new Date().toISOString();
    }
    /**
     * @name serviceName
     */
    get serviceName() {
        return this.config.serviceName;
    }
    /**
     * @name serviceDescription
     */
    get serviceDescription() {
        return this.config.serviceDescription;
    }
    /**
     * @name serviceIP
     * @return IP address {string}
     */
    get serviceIP() {
        return this.config.serviceIP;
    }
    /**
     * @name servicePort
     * @return Port number {number}
     */
    get servicePort() {
        return this.config.servicePort;
    }
    /**
     * @name serviceInstanceID
     * @return service instance ID {string}
     */
    get serviceInstanceID() {
        return this.instanceID;
    }
    /**
     * @name cloneRedisClient
     * @summary Clone Redis client
     * @returns Redis client
     */
    cloneRedisClient() {
        return this.client.duplicate();
    }
}
exports.Hydra = Hydra;
