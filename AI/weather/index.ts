import { cryptoObserverConfig } from "./observer/observer.config.js";
import { runObserver } from "./observer/observer.js";








export async function runWeather() {

  runObserver(cryptoObserverConfig);

}




runWeather()
  .catch((error) => {
    console.error("Weather run failed:", error);
    process.exitCode = 1;
  });






