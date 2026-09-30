import "dotenv/config";


export const requiredEnv = (name: string) => {
    const value = process.env[name];
  
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  
    return value;
  };