import net from 'net';
import dns from 'dns';
import os from 'os';
import { IHydraConfig } from './hydra-config';

export class Network {
  /**
   * @name getServiceIP
   * @summary Get service IP
   * @param config IHydraConfig
   * @returns Promise<string>
   */
  getServiceIP(config: IHydraConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      if (config.serviceDNS && config.serviceDNS !== '') {
        config.serviceIP = config.serviceDNS;
      } else {
        if (config.serviceIP && config.serviceIP !== '' && net.isIP(config.serviceIP) === 0) {
          dns.lookup(config.serviceIP, (err, result) => {
            resolve(result);
          });
        }  else if (!config.serviceIP || config.serviceIP === '') {
          const interfaces = os.networkInterfaces();
          if (config.serviceInterface && config.serviceInterface !== '') {
            const segments = config.serviceInterface.split('/');
            if (segments && segments.length === 2) {
              const interfaceName = segments[0];
              const interfaceMask = segments[1];
              Object.keys(interfaces).
                forEach((itf) => {
                  interfaces[itf].forEach((interfaceRecord)=>{
                    if (itf === interfaceName && interfaceRecord.netmask === interfaceMask && interfaceRecord.family === 'IPv4') {
                      resolve(interfaceRecord.address);
                    }
                  });
                });
            } else {
              reject(new Error('config serviceInterface is not a valid format'));
            }
          } else {
            // not using serviceInterface - just select first eth0 entry.
            let firstSelected = false;
            Object.keys(interfaces).
              forEach((itf) => {
                interfaces[itf].forEach((interfaceRecord)=>{
                  if (!firstSelected && interfaceRecord.family === 'IPv4' && interfaceRecord.address !== '127.0.0.1') {
                    resolve(interfaceRecord.address);
                    firstSelected = true;
                  }
                });
              });
          }
        }  
      } 
    });
  }
}
