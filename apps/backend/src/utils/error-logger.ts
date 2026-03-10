export interface ErrorLog {
  timestamp: Date;
  source: string;
  message: string;
  stack?: string;
}

const errorLogs: ErrorLog[] = [];

export const errorLogger = {
  push: (source: string, error: any) => {
    errorLogs.push({
      timestamp: new Date(),
      source,
      message: error.message || String(error),
      stack: error.stack
    });
    // Keep only the last 100 errors to avoid memory issues
    if (errorLogs.length > 100) {
      errorLogs.shift();
    }
  },
  getLogs: () => [...errorLogs]
};
