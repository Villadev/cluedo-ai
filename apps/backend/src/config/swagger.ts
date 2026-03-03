import path from 'node:path';

const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cluedo API',
      version: '1.0.0',
      description: 'Documentació API backend Cluedo'
    },
    servers: [
      {
        url: process.env.BASE_URL || 'http://localhost:3000'
      }
    ]
  },
  apis: [path.resolve(__dirname, '../modules/**/*.routes.{js,ts}')]
};

export const swaggerSpec = swaggerJSDoc(options);
