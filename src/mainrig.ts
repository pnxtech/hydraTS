import { Hydra } from './main';
import config from './config/config.json';

const main = async () => {
  const hydra = new Hydra();
  await hydra.init(config.hydra);
  const serviceInfo = await hydra.registerService();
  console.log(`${serviceInfo.serviceName} listening on ${serviceInfo.serviceIP}:${serviceInfo.servicePort}`);

  setTimeout(async () => {
    await hydra.shutdown();
  }, 15000);
};

main();
