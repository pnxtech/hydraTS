import { Hydra } from './main';
import config from './config/config.json';

const main = async () => {
  const hydra = new Hydra();
  await hydra.init(config.hydra);
  const result = await hydra.registerService();
  console.log(result);
};

main();
