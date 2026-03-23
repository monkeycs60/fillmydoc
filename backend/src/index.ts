import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import template from './routes/template'
import generate from './routes/generate'
import signing from './routes/signing'
import webhooksRouter from './routes/webhooks'

const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/api/template', template)
app.route('/api/generate', generate)
app.route('/api/signing', signing)
app.route('/api/webhooks', webhooksRouter)

serve({ fetch: app.fetch, port: 3001 })
console.log('FillMyDoc backend running on http://localhost:3001')
