import { Hono } from 'hono'
import { eq, desc, sql, and, gte, lte, like } from 'drizzle-orm'
import { db, jobs, signingRequests } from '../db/index'

const history = new Hono()

// ---------------------------------------------------------------------------
// GET / — List all jobs with pagination and filters
// ---------------------------------------------------------------------------
history.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10)
  const limit = parseInt(c.req.query('limit') || '20', 10)
  const offset = (page - 1) * limit

  const mode = c.req.query('mode') // 'download' | 'sign'
  const template = c.req.query('template') // search by template name
  const dateFrom = c.req.query('dateFrom') // ISO date string
  const dateTo = c.req.query('dateTo') // ISO date string

  // Build conditions array
  const conditions = []
  if (mode) {
    conditions.push(eq(jobs.mode, mode))
  }
  if (template) {
    conditions.push(like(jobs.templateName, `%${template}%`))
  }
  if (dateFrom) {
    conditions.push(gte(jobs.createdAt, dateFrom))
  }
  if (dateTo) {
    // Add a day to dateTo to include the entire day
    conditions.push(lte(jobs.createdAt, dateTo + 'T23:59:59.999Z'))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Get total count
  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(jobs)
    .where(whereClause)
    .get()
  const total = countResult?.count || 0

  // Get jobs
  const jobList = db
    .select()
    .from(jobs)
    .where(whereClause)
    .orderBy(desc(jobs.createdAt))
    .limit(limit)
    .offset(offset)
    .all()

  // For each job, get signing stats if mode is 'sign'
  const jobsWithStats = jobList.map((job) => {
    if (job.mode === 'sign') {
      const signingDocs = db
        .select()
        .from(signingRequests)
        .where(eq(signingRequests.jobId, job.id))
        .all()

      const totalDocs = signingDocs.length
      const signedDocs = signingDocs.filter(
        (d) => d.status === 'signed' || d.status === 'esign_completed'
      ).length
      const pendingDocs = totalDocs - signedDocs

      return {
        ...job,
        signingStats: {
          total: totalDocs,
          signed: signedDocs,
          pending: pendingDocs,
        },
      }
    }
    return { ...job, signingStats: null }
  })

  return c.json({
    jobs: jobsWithStats,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
})

// ---------------------------------------------------------------------------
// GET /stats — Global statistics
// ---------------------------------------------------------------------------
history.get('/stats', async (c) => {
  // Total documents generated
  const totalDocsResult = db
    .select({ total: sql<number>`COALESCE(SUM(csv_row_count), 0)` })
    .from(jobs)
    .get()
  const totalDocs = totalDocsResult?.total || 0

  // Total jobs
  const totalJobsResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(jobs)
    .get()
  const totalJobs = totalJobsResult?.count || 0

  // Signing stats
  const totalSigningResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(signingRequests)
    .get()
  const totalSigningDocs = totalSigningResult?.count || 0

  const signedResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(signingRequests)
    .where(
      sql`${signingRequests.status} IN ('signed', 'esign_completed')`
    )
    .get()
  const signedDocs = signedResult?.count || 0

  // Signing rate
  const signingRate = totalSigningDocs > 0 ? Math.round((signedDocs / totalSigningDocs) * 100) : 0

  // Average signing time (time between createdAt and signedAt for signed docs)
  const avgTimeResult = db
    .select({
      avgSeconds: sql<number>`AVG(
        CAST((julianday(${signingRequests.signedAt}) - julianday(${signingRequests.createdAt})) * 86400 AS REAL)
      )`,
    })
    .from(signingRequests)
    .where(
      sql`${signingRequests.status} IN ('signed', 'esign_completed') AND ${signingRequests.signedAt} IS NOT NULL`
    )
    .get()
  const avgSigningTimeSeconds = avgTimeResult?.avgSeconds || 0

  // Format average time in a human-readable way (hours)
  const avgSigningTimeHours = avgSigningTimeSeconds > 0
    ? Math.round(avgSigningTimeSeconds / 3600 * 10) / 10
    : 0

  // Jobs by mode
  const downloadJobsResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(jobs)
    .where(eq(jobs.mode, 'download'))
    .get()
  const signJobsResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(jobs)
    .where(eq(jobs.mode, 'sign'))
    .get()

  return c.json({
    totalDocs,
    totalJobs,
    totalSigningDocs,
    signedDocs,
    signingRate,
    avgSigningTimeSeconds: Math.round(avgSigningTimeSeconds),
    avgSigningTimeHours,
    downloadJobs: downloadJobsResult?.count || 0,
    signJobs: signJobsResult?.count || 0,
  })
})

// ---------------------------------------------------------------------------
// GET /:jobId — Job details with signing requests
// ---------------------------------------------------------------------------
history.get('/:jobId', async (c) => {
  const { jobId } = c.req.param()

  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get()
  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  // Get signing requests if this is a sign job
  let documents: Array<{
    id: string
    fileName: string
    recipientName: string | null
    recipientEmail: string | null
    status: string
    signedAt: string | null
    signedByName: string | null
  }> = []

  if (job.mode === 'sign') {
    const signingDocs = db
      .select()
      .from(signingRequests)
      .where(eq(signingRequests.jobId, jobId))
      .all()

    documents = signingDocs.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      recipientName: d.recipientName,
      recipientEmail: d.recipientEmail,
      status: d.status,
      signedAt: d.signedAt,
      signedByName: d.signedByName,
    }))
  }

  return c.json({ job, documents })
})

export default history
