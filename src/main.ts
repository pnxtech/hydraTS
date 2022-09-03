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
 */
export class Hydra extends EventEmitter {
  private client;
  private config: IHydraConfig;
  private instanceID: string;
  private redisPreKey = 'hydra:service';
  private mcMessageKey = 'hydra:service:mc';
  private net = new Network();
 
  private mcMessageChannelClient;
  private mcDirectMessageChannelClient;
  private publishChannel = null;

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

    this.client.on('error', (err) => console.log('Redis Client Error', err));
    this.config.serviceIP = await this.net.getServiceIP(this.config);
    console.log(this.config.serviceIP);
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
    console.log(entry);
    if (entry && !this.client.closing) {
      await this.client.multi()
        .set(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:presence`, this.instanceID, {
          EX: KEY_EXPIRATION_TTL,
          NX: true
        })
        .hSet(`${this.redisPreKey}:nodes`, this.instanceID, entry)
        .exec();
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
    await this.client.multi()
      .set(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health`, JSON.stringify(entry), {
        EX: KEY_EXPIRATION_TTL,
        NX: true
      })
      .expire(`${this.redisPreKey}:${this.serviceName}:${this.instanceID}:health:log`, ONE_WEEK_IN_SECONDS)
      .exec();
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

    await this.client.set(`${this.redisPreKey}:${this.config.serviceName}:service`, serviceEntry);

    // Setup service message channels
    this.mcMessageChannelClient = this.cloneRedisClient();
    this.mcMessageChannelClient.subscribe(`${this.mcMessageKey}:${this.config.serviceName}`);
    this.mcMessageChannelClient.on('message', (_channel, message) => {
      const msg = JSON.parse(message);
      if (msg) {
        const umfMsg = new UMFMessage();
        umfMsg.createMessage(msg);
        this.emit('message', umfMsg.toShort());
      }
    });

    this.mcDirectMessageChannelClient =  this.cloneRedisClient();
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
