import EventEmitter from 'events';
import { createClient } from 'redis';
import { IHydraConfig } from './lib/hydra-config';
import { Network } from './lib/network';
import { v4 as uuidv4 } from 'uuid';
import { UMFMessage, parseRoute} from './lib/umfmessage';

/**
 * Hydra class
 */
export class Hydra extends EventEmitter { 
  private client;
  private config: IHydraConfig;
  private instanceID: string;

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
  async init(config: IHydraConfig) {
    this.config = config;
    this.client = createClient({
      url: this.config.redis.url
    });
    this.client.on('error', (err) => console.log('Redis Client Error', err));
    await this.client.connect();

    // const s = await this.client.get('hydra:service:hydra-logging-svcs:service');
    // console.log(s);
    const net = new Network();
    this.config.serviceIP = await net.getServiceIP(this.config);
    console.log(this.config.serviceIP);

    this.instanceID = uuidv4().replace(RegExp('-', 'g'), '');
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
