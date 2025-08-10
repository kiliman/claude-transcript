    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }
}

const service = new DataCaptureService();
service.start();