import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {logger} from 'hono/logger'
import auth from './routes/auth'
import type { AppVariables } from './types'

const app = new Hono<{ Variables: AppVariables }>()

//middleware global
app.use('*', cors())
app.use('*', logger())

//routes
app.route('/api/auth', auth)

//health check
app.get('/', (c) => {
    return c.json({message: 'Nodewave API is Running'})
})

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
}