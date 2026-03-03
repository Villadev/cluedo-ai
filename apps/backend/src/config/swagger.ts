import path from 'node:path';

const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cluedo AI Backend API',
      version: '1.0.0',
      description: 'REST API documentation for multiplayer AI-powered Cluedo game.'
    },
    servers: [
      {
        url: process.env.BASE_URL || 'http://localhost:3000'
      }
    ]
  },
  apis: [path.resolve(__dirname, '../routes/**/*.ts'), path.resolve(__dirname, '../routes/**/*.js')]
};

export const swaggerSpec = swaggerJSDoc(options);
