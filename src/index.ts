import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {logger} from 'hono/logger'
import auth from './routes/auth'
import type { AppVariables } from './types'
import projects from './routes/project'
import tasks from './routes/tasks'

const app = new Hono<{ Variables: AppVariables }>()

//middleware global
app.use('*', cors())
app.use('*', logger())

//routes
app.route('/api/auth', auth)
app.route('/api/projects', projects)
app.route('/api/tasks', tasks)

//health check
app.get('/', (c) => {
    return c.json({message: 'Nodewave API is Running'})
})

export default {
  port: Number(process.env.PORT) || 3000,
  hostname: '0.0.0.0',
  fetch: app.fetch,
}