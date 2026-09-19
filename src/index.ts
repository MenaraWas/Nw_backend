import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {logger} from 'hono/logger'
import auth from './routes/auth'

const app = new Hono()

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