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
/**
 * Hydra class
 */
class Hydra extends events_1.default {
    constructor() {
        super(...arguments);
        this.client = (0, redis_1.createClient)();
    }
    /**
     * @name init
     * @summary Initialize Hydra
     * @param config IHydraConfig
     */
    init(config) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, redis_1.createClient)({
                url: config.redis.url
            });
            this.client.on('error', (err) => console.log('Redis Client Error', err));
            yield this.client.connect();
        });
    }
}
exports.Hydra = Hydra;
