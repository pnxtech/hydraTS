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
const main_1 = require("./main");
const config_json_1 = __importDefault(require("./config/config.json"));
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    const hydra = new main_1.Hydra();
    yield hydra.init(config_json_1.default.hydra);
    const serviceInfo = yield hydra.registerService();
    console.log(`${serviceInfo.serviceName} listening on ${serviceInfo.serviceIP}:${serviceInfo.servicePort}`);
    setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        yield hydra.shutdown();
    }), 15000);
});
main();
