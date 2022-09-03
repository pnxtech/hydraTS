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
        this.publishChannel = null;
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
            this.client.on('error', (err) => console.log('Redis Client Error', err));
            this.config.serviceIP = yield this.net.getServiceIP(this.config);
            console.log(this.config.serviceIP);
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
            console.log(entry);
            if (entry && !this.client.closing) {
                yield this.client.multi()
                    .set(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:presence`, this.instanceID, {
                    EX: KEY_EXPIRATION_TTL,
                    NX: true
                })
                    .hSet(`${this.redisPreKey}:nodes`, this.instanceID, entry)
                    .exec();
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
            yield this.client.multi()
                .set(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health`, JSON.stringify(entry), {
                EX: KEY_EXPIRATION_TTL,
                NX: true
            })
                .expire(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health:log`, ONE_WEEK_IN_SECONDS)
                .exec();
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
            yield this.client.set(`${this.redisPreKey}:${this.config.serviceName}:service`, serviceEntry);
            // Setup service message channels
            this.mcMessageChannelClient = this.cloneRedisClient();
            this.mcMessageChannelClient.subscribe(`${this.mcMessageKey}:${this.config.serviceName}`);
            this.mcMessageChannelClient.on('message', (_channel, message) => {
                const msg = JSON.parse(message);
                if (msg) {
                    const umfMsg = new umfmessage_1.UMFMessage();
                    umfMsg.createMessage(msg);
                    this.emit('message', umfMsg.toShort());
                }
            });
            this.mcDirectMessageChannelClient = this.cloneRedisClient();
            this.mcDirectMessageChannelClient.subscribe(`${this.mcMessageKey}:${this.config.serviceName}:${this.instanceID}`);
            this.mcDirectMessageChannelClient.on('message', (_channel, message) => {
                const msg = JSON.parse(message);
                if (msg) {
                    const umfMsg = new umfmessage_1.UMFMessage();
                    umfMsg.createMessage(msg);
                    this.emit('message', umfMsg.toShort());
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
