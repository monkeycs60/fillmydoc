import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import template from './routes/template'
import generate from './routes/generate'
import signing from './routes/signing'
import { startScheduler } from './services/scheduler'
import history from './routes/history'
import savedTemplatesRoute from './routes/saved-templates'
import webhooksRouter from './routes/webhooks'
import brandingRoutes from './routes/branding'

const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/api/template', template)
app.route('/api/generate', generate)
app.route('/api/signing', signing)
app.route('/api/history', history)
app.route('/api/saved-templates', savedTemplatesRoute)
app.route('/api/webhooks', webhooksRouter)
app.route('/api/branding', brandingRoutes)

serve({ fetch: app.fetch, port: 3001 })
console.log('FillMyDoc backend running on http://localhost:3001')

// Start the automatic reminder scheduler
startScheduler()
