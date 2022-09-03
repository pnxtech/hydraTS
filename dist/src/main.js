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
const redis_1 = require("redis");
const network_1 = require("./lib/network");
const uuid_1 = require("uuid");
/**
 * Hydra class
 */
class Hydra extends events_1.default {
    /**
     * @name constructor
     */
    constructor() {
        super();
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
            this.client.on('error', (err) => console.log('Redis Client Error', err));
            yield this.client.connect();
            // const s = await this.client.get('hydra:service:hydra-logging-svcs:service');
            // console.log(s);
            const net = new network_1.Network();
            this.config.serviceIP = yield net.getServiceIP(this.config);
            console.log(this.config.serviceIP);
            this.instanceID = (0, uuid_1.v4)().replace(RegExp('-', 'g'), '');
        });
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
    get cloneRedisClient() {
        return this.client.duplicate();
    }
}
exports.Hydra = Hydra;
