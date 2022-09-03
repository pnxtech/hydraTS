"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRoute = exports.UMFMessage = void 0;
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
/**
* @name UMFMessage
* @summary UMF Message helper
*/
class UMFMessage {
    /**
    * @name constructor
    * @summary class constructor
    * @return {undefined}
    */
    constructor() {
        this.UMF_VERSION = 'UMF/1.4.6';
        this.message = {
            to: '',
            mid: this.createMessageID(),
        };
    }
    createMessage(message) {
        if (message.to) {
            this.message.to = message.to;
        }
        if (message.from || message.frm) {
            this.message.from = message.from || message.frm;
        }
        if (message.headers || message.hdr) {
            this.message.headers = message.headers || message.hdr;
        }
        this.message.mid = message.mid || this.createMessageID();
        if (message.rmid) {
            this.message.rmid = message.rmid;
        }
        if (message.signature || message.sig) {
            this.message.signature = message.signature || message.sig;
        }
        if (message.timeout || message.tmo) {
            this.message.timeout = message.timeout || message.tmo;
        }
        this.message.timestamp = message.timestamp || message.ts || this.getTimeStamp();
        if (message.type || message.typ) {
            this.message.type = message.type || message.typ;
        }
        this.message.version = message.version || message.ver || this.UMF_VERSION;
        if (message.via) {
            this.message.via = message.via;
        }
        if (message.forward || message.fwd) {
            this.message.forward = message.forward || message.fwd;
        }
        if (message.body || message.bdy) {
            this.message.body = message.body || message.bdy;
        }
        if (message.authorization || message.aut) {
            this.message.authorization = message.authorization || message.aut;
        }
        return this.message;
    }
    /**
    * @name getTimeStamp
    * @summary retrieve an ISO 8601 timestamp
    * @return {string} timestamp - ISO 8601 timestamp
    */
    getTimeStamp() {
        return new Date().toISOString();
    }
    /**
    * @name createMessageID
    * @summary Returns a UUID for use with messages
    * @return {string} uuid - UUID
    */
    createMessageID() {
        return (0, uuid_1.v4)();
    }
    /**
    * @name createShortMessageID
    * @summary Returns a short form UUID for use with messages
    * @see https://en.wikipedia.org/wiki/Base36
    * @return {string} short identifer
    */
    createShortMessageID() {
        return (Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)).toString(36);
    }
    /**
    * @name signMessage
    * @summary sign message with cryptographic signature
    * @param {string} algo - such as 'sha256'
    * @param {string} sharedSecret - shared secret
    * @return {void}
    */
    signMessage(algo, sharedSecret) {
        (this.message.signature) && delete this.message.signature;
        this.message.signature = crypto_1.default
            .createHmac(algo, sharedSecret)
            .update(JSON.stringify(this.message))
            .digest('hex');
    }
    /**
    * @name toJSON
    * @return {IUMFMessage} A JSON stringifiable version of message
    */
    toJSON() {
        return this.message;
    }
    /**
    * @name toShort
    * @summary convert a long message to a short one
    * @return {IUMFMessage} converted message
    */
    toShort() {
        const message = {
            to: '',
            mid: this.createMessageID(),
        };
        if (this.message['to']) {
            message['to'] = this.message['to'];
        }
        if (this.message['from']) {
            message['frm'] = this.message['from'];
        }
        if (this.message['headers']) {
            message['hdr'] = this.message['headers'];
        }
        if (this.message['mid']) {
            message['mid'] = this.message['mid'];
        }
        if (this.message['rmid']) {
            message['rmid'] = this.message['rmid'];
        }
        if (this.message['signature']) {
            message['sig'] = this.message['signature'];
        }
        if (this.message['timeout']) {
            message['tmo'] = this.message['timeout'];
        }
        if (this.message['timestamp']) {
            message['ts'] = this.message['timestamp'];
        }
        if (this.message['type']) {
            message['typ'] = this.message['type'];
        }
        if (this.message['version']) {
            message['ver'] = this.message['version'];
        }
        if (this.message['via']) {
            message['via'] = this.message['via'];
        }
        if (this.message['forward']) {
            message['fwd'] = this.message['forward'];
        }
        if (this.message['body']) {
            message['bdy'] = this.message['body'];
        }
        if (this.message['authorization']) {
            message['aut'] = this.message['authorization'];
        }
        return message;
    }
    /**
    * @name validate
    * @summary Validates that a UMF message has required fields
    * @return {boolean} response - returns true is valid otherwise false
    */
    validate() {
        if (!this.message.from || !this.message.to || !this.message.body) {
            return false;
        }
        else {
            return true;
        }
    }
}
exports.UMFMessage = UMFMessage;
/**
 * @name parseRoute
 * @summary parses message route strings
 * @param {string} toValue - string to be parsed
 * @return {IParsedRoute} object - containing route parameters. If the
 *                  object contains an error field then the route
 *                  isn't valid.
 */
function parseRoute(toValue) {
    let serviceName = '';
    let httpMethod;
    let apiRoute = '';
    let error = '';
    const urlRoute = toValue;
    let instance = '';
    let subID = '';
    const segments = urlRoute.split(':');
    if (segments.length < 2) {
        error = 'route field has invalid number of routable segments';
    }
    else {
        const atPos = segments[0].indexOf('@');
        if (atPos > -1) {
            const x = segments.shift();
            instance = x.substring(0, atPos);
            segments.unshift(x.substring(atPos + 1));
            const segs = instance.split('-');
            if (segs.length > 1) {
                instance = segs[0];
                subID = segs[1];
            }
        }
        if (segments[0].indexOf('http') === 0) {
            const url = `${segments[0]}:${segments[1]}`;
            segments.shift();
            segments[0] = url;
        }
        serviceName = segments.shift();
        apiRoute = segments.join(':');
        const s1 = apiRoute.indexOf('[');
        if (s1 === 0) {
            const s2 = apiRoute.indexOf(']');
            if (s2 < 0) {
                error = 'route field has ill-formed HTTP method verb in segment';
            }
            else {
                httpMethod = apiRoute.substring(s1 + 1, s2).toLowerCase();
            }
            if (!error) {
                const s3 = httpMethod.length;
                if (s3 > 0) {
                    apiRoute = apiRoute.substring(s3 + 2, apiRoute.length);
                }
            }
        }
    }
    const parsedRoute = {
        instance,
        subID,
        serviceName,
        httpMethod,
        apiRoute,
        error
    };
    return parsedRoute;
}
exports.parseRoute = parseRoute;
