import EventEmitter from 'events';
import util from 'util';
import { createClient } from 'redis';
import { IHydraConfig } from './lib/hydra-config';
import { Network } from './lib/network';
import { UMFMessage, parseRoute } from './lib/umfmessage';
import { v4 as uuidv4 } from 'uuid';

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
export class Hydra extends EventEmitter {
  private client;
  private config: IHydraConfig;
  private instanceID: string;
  private redisPreKey = 'hydra:service';
  private mcMessageKey = 'hydra:service:mc';
  private net = new Network();

  private mcMessageChannelClient = null;
  private mcDirectMessageChannelClient = null;
  // private publishChannel = null;

  private presenceTimerInteval = null;
  private healthTimerInterval = null;

  /**
   * @name constructor
   */
  constructor() {
    super();
    this.updatePresence = this.updatePresence.bind(this);
    this.updateHealthCheck = this.updateHealthCheck.bind(this);
  }

  /**
   * @name init
   * @summary Initialize Hydra
   * @param config IHydraConfig 
   */
  async init(config: IHydraConfig) {
    this.config = config;
    this.client = createClient({
      url: this.config.redis.url
    });
    this.instanceID = uuidv4().replace(RegExp('-', 'g'), '');

    this.client.on('error', (err) => console.log('Hydra Redis Client Error', err));
    this.client.on('connect', () => console.log('HydraRedis Client Connected'));
    this.client.on('ready', () => console.log('HydraRedis Client Ready'));
    this.client.on('reconnecting', () => console.log('HydraRedis Client Reconnecting'));
    this.client.on('end', () => console.log('HydraRedis Client End'));

    this.config.serviceIP = await this.net.getServiceIP(this.config);
    await this.client.connect();
  }

  /**
   * @name updatePresence
   * @summary Update service presence in Redis
   */
  private async updatePresence() {
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
      await this.client.MULTI()
        .SET(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:presence`, this.instanceID, {
          EX: KEY_EXPIRATION_TTL,
          NX: true
        })
        .HSET(`${this.redisPreKey}:nodes`, this.instanceID, entry)
        .EXEC();
    }
  }

  /**
   * @name updateHealthCheck
   * @summary Update health check info
   */
  private async updateHealthCheck() {
    const entry = Object.assign({
      updatedOn: this.timestamp
    }, this.getHealth());
    await this.client.MULTI()
      .SET(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health`, JSON.stringify(entry), {
        EX: KEY_EXPIRATION_TTL,
        NX: true
      })
      .EXPIRE(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health:log`, ONE_WEEK_IN_SECONDS)
      .EXEC();
  }

  /**
   * @name getHealth
   * @summary Retrieve server health info.
   * @return {object} obj - object containing server info
   */
  getHealth() {
    let lines = [];
    let keyval = [];
    interface IMap {
      [key: string]: number
    }
    const memMap: IMap = {};
    let memory = util.inspect(process.memoryUsage());
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
  async registerService() {
    const serviceEntry = JSON.stringify({
      serviceName: this.config.serviceName,
      type: this.config.serviceType,
      registeredOn: this.timestamp
    });

    await this.client.SET(`${this.redisPreKey}:${this.config.serviceName}:service`, serviceEntry);

    // Setup service message channels
    this.mcMessageChannelClient = this.cloneRedisClient();
    this.mcMessageChannelClient.connect();
    this.mcMessageChannelClient.subscribe(`${this.mcMessageKey}:${this.config.serviceName}`);
    this.mcMessageChannelClient.on('message', (_channel, message) => {
      const msg = JSON.parse(message);
      if (msg) {
        const umfMsg = new UMFMessage();
        umfMsg.createMessage(msg);
        this.emit('message', umfMsg.toShort());
      }
    });

    this.mcDirectMessageChannelClient = this.cloneRedisClient();
    this.mcDirectMessageChannelClient.connect();
    this.mcDirectMessageChannelClient.subscribe(`${this.mcMessageKey}:${this.config.serviceName}:${this.instanceID}`);
    this.mcDirectMessageChannelClient.on('message', (_channel, message) => {
      const msg = JSON.parse(message);
      if (msg) {
        const umfMsg = new UMFMessage();
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
  }

  /**
   * @name _getQueuedMessage
   * @summary retrieve a queued message
   * @param {string} serviceName who's queue might provide a message
   * @return {promise} promise - resolving to the message that was dequeued or a rejection.
   */
  async getQueuedMessage(serviceName) {
    return await this.client.RPOPLPUSH(`${this.redisPreKey}:${serviceName}:mqrecieved`, `${this.redisPreKey}:${serviceName}:mqinprogress`);
  }

  /**
   * @name queueMessage
   * @summary Queue a message
   * @param {object} message - UMF message to queue
   * @return {promise} promise - resolving to the message that was queued or a rejection.
   */
  async queueMessage(message) {
    const umfMsg = new UMFMessage();
    umfMsg.createMessage(message);
    if (!umfMsg.validate()) {
      throw new Error('UMF message is invalid');
    }

    const msg = umfMsg.toShort();
    const parsedRoute = parseRoute(msg.to);
    if (parsedRoute.error) {
      throw new Error(parsedRoute.error);
    }

    const serviceName = parsedRoute.serviceName;
    await this.client.LPUSH(`${this.redisPreKey}:${serviceName}:mqrecieved`, JSON.stringify(msg));
    return message;
  }

  /**
   * @name _markQueueMessage
   * @summary Mark a queued message as either completed or not
   * @param {object} message - message in question
   * @param {boolean} completed - (true / false)
   * @param {string} reason - if not completed this is the reason processing failed
   * @return {promise} promise - resolving to the message that was dequeued or a rejection.
   */
  async markQueueMessage(message, completed, reason) {
    let strMessage = JSON.stringify(message);
    await this.client.LREM(`${this.redisPreKey}:${this.serviceName}:mqinprogress`, -1, strMessage);
    if (message.bdy) {
      message.bdy.reason = reason || 'reason not provided';
    } else if (message.body) {
      message.body.reason = reason || 'reason not provided';
    }
    if (completed) {
      return message;
    }
    strMessage = JSON.stringify(message);
    return await this.client.RPUSH(`${this.redisPreKey}:${this.serviceName}:mqincomplete`, strMessage);
  }

  /**
   * @name shutdown
   * @summary Shutdown Hydra
   */
  async shutdown() {
    if (this.presenceTimerInteval) {
      clearInterval(this.presenceTimerInteval);
    }
    if (this.healthTimerInterval) {
      clearInterval(this.healthTimerInterval);
    }
    await this.client.MULTI()
      .EXPIRE(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health`, KEY_EXPIRATION_TTL)
      .EXPIRE(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health:log`, ONE_WEEK_IN_SECONDS)
      .EXEC();
    await this.client.DEL(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:presence`);

    await Promise.all([
      await this.mcMessageChannelClient.quit(),
      await this.mcDirectMessageChannelClient.quit(),
      // this.publishChannel.quit(),
      await this.client.QUIT()
    ]);
  }

  /**
   * @name timestamp
   * @summary Retrieve an ISO 8601 timestamp.
   * @return {string} timestamp - ISO 8601 timestamp
   */
  private get timestamp(): string {
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
