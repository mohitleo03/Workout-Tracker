import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','), credentials: true }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (!env.isProd) app.use(morgan('dev'));

app.get('/', (_req, res) =>
  res.json({
    success: true,
    data: {
      name: 'Workout Tracker API',
      version: '1.0.0',
      basePath: env.apiPrefix,
      health: `${env.apiPrefix}/health`,
    },
  })
);

app.use(env.apiPrefix, routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
