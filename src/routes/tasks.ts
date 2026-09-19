import { Hono } from 'hono'
import prisma from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { z } from 'zod'
import type { AppVariables } from '../types'
import { BuildQueryFilter, extractQueryFromParams } from '@nodewave/prisma-ezfilter'

const tasks = new Hono<{ Variables: AppVariables }>()

tasks.use('*', authMiddleware)

const createTaskSchema = z.object({
    projectId: z.string(),
    title: z.string().min(1),
    description: z.string().optional(),
    assigneeId: z.string().optional(),
    clientVisible: z.boolean().optional().default(false),
    dependencyIds: z.array(z.string()).optional().default([]),
})

const updateStatusSchema = z.object({
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
    version: z.number()
})

const uploadAttachmentSchema = z.object({
    attachment: z.string().min(1),
})

const taskQueryBuilder = new BuildQueryFilter({
  allowedFields: ['title', 'status', 'clientVisible', 'createdAt'],
  maxPageSize: 50,
  defaultPageSize: 20,
})

//helper untuk ctat audit log
async function createAuditLog(
    taskId: string, 
    userId: string,
    column: string,
    oldValue: string | null, 
    newValue: string | null
) {
    await prisma.auditLog.create({
        data: {taskId, userId, column, oldValue, newValue},
    })
}

// helper cek pre-requies is done
async function checkDependenciesDone(taskId: string): Promise<boolean> {
    const dependencies = await prisma.taskDependency.findMany({
        where: { dependentId: taskId},
        include: {prerequisite: true},
    })

    if (dependencies.length === 0) return true
    return dependencies.every((dep) => dep.prerequisite.status === 'DONE')
}

async function checkDependencies(taskId: string): Promise<boolean> {
  return checkDependenciesDone(taskId)
}

// Get tasks by project
tasks.get('/project/:projectId', async (c) => {
  const user = c.get('user')
  const { projectId } = c.req.param()

  try {
    const isMember = await prisma.projectMember.findFirst({
      where: { projectId, userId: user.id },
    })

    if (!isMember) {
      return c.json({ message: 'Akses ditolak' }, 403)
    }

    const queryParams = c.req.query()
    const filter = extractQueryFromParams(queryParams)
    const { query } = taskQueryBuilder.build(filter)

    const where = {
      ...query.where,
      projectId,
      deletedAt: null,
    }

    const [data, total] = await Promise.all([
      prisma.task.findMany({
        ...query,
        where,
        include: {
          assignee: { select: { id: true, name: true, department: true } },
          dependencies: {
            include: {
              prerequisite: { select: { id: true, title: true, status: true } },
            },
          },
          auditLogs: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { user: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.task.count({ where }),
    ])

    if (user.role === 'CLIENT') {
      const clientData = data
        .filter((t) => t.clientVisible)
        .map((t) => ({ id: t.id, title: t.title, status: t.status }))
      return c.json({ data: clientData, total: clientData.length, page: filter.page || 1, rows: filter.rows || 20 })
    }

    return c.json({ data, total, page: filter.page || 1, rows: filter.rows || 20 })
  } catch (error) {
    return c.json({ message: 'Gagal mengambil data task', error }, 500)
  }
})

//create task PM only
tasks.post('/', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json({ message: 'Hanya PM yang bisa membuat task' }, 403)
  }

  try {
    const body = await c.req.json()
    const data = createTaskSchema.parse(body)

    // Cek apakah PM adalah member project
    const isMember = await prisma.projectMember.findFirst({
      where: { projectId: data.projectId, userId: user.id },
    })

    if (!isMember) {
      return c.json({ message: 'Akses ditolak' }, 403)
    }

    // Tentukan status awal berdasarkan dependency
    const task = await prisma.task.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        assigneeId: data.assigneeId,
        clientVisible: data.clientVisible,
        status: data.dependencyIds.length > 0 ? 'BLOCKED' : 'TODO',
      },
    })
    // Buat dependency jika ada
    if (data.dependencyIds.length > 0) {
      await prisma.taskDependency.createMany({
        data: data.dependencyIds.map((prerequisiteId) => ({
          dependentId: task.id,
          prerequisiteId,
        })),
      })
    }

    // Catat audit log
    await createAuditLog(task.id, user.id, 'status', null, task.status)

    return c.json({ message: 'Task berhasil dibuat', data: task }, 201)
  } catch (error) {
    return c.json({ message: 'Gagal membuat task', error }, 400)
  }
})

// Update status task
tasks.patch('/:id/status', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  try {
    const body = await c.req.json()
    const { status, version } = updateStatusSchema.parse(body)

    // Ambil task saat ini
    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
    })

    if (!task) {
      return c.json({ message: 'Task tidak ditemukan' }, 404)
    }
    // Optimistic locking: cek versi
    if (task.version !== version) {
      return c.json(
        {
          message: 'Data sudah diubah oleh orang lain. Refresh dan coba lagi.',
          currentVersion: task.version,
        },
        409
      )
    }

    // PM tidak bisa set status ke DONE
    if (user.role === 'PM' && status === 'DONE') {
      return c.json(
        { message: 'PM tidak bisa menyelesaikan task, hanya eksekutor' },
        403
      )
    }
    // Internal team: cek dependency sebelum set IN_PROGRESS
    if (user.role === 'INTERNAL' && status === 'IN_PROGRESS') {
      const dependenciesMet = await checkDependencies(id)
      if (!dependenciesMet) {
        return c.json(
          {
            message:
              'Task masih BLOCKED. Selesaikan prerequisite task terlebih dahulu.',
          },
          403
        )
      }
    }
    // Update status + increment version
    const oldStatus = task.status
    const updated = await prisma.task.update({
      where: { id },
      data: {
        status,
        version: { increment: 1 },
      },
    })

    // Catat audit log
    await createAuditLog(id, user.id, 'status', oldStatus, status)

    // Jika task selesai, cek apakah ada task lain yang bisa di-unblock
    if (status === 'DONE') {
      const dependents = await prisma.taskDependency.findMany({
        where: { prerequisiteId: id },
        select: { dependentId: true },
      })

      for (const dep of dependents) {
        const allMet = await checkDependencies(dep.dependentId)
        if (allMet) {
          await prisma.task.update({
            where: { id: dep.dependentId },
            data: { status: 'TODO', version: { increment: 1 } },
          })
          await createAuditLog(dep.dependentId, user.id, 'status', 'BLOCKED', 'TODO')
        }
      }
    }

    return c.json({ message: 'Status berhasil diupdate', data: updated })
  } catch (error) {
    return c.json({ message: 'Gagal mengupdate status', error }, 400)
  }
})

// Update description task (hanya PM)
tasks.patch('/:id/description', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json(
      { message: 'Hanya PM yang bisa mengubah deskripsi task' },
      403
    )
  }
  const { id } = c.req.param()

  try {
    const body = await c.req.json()
    const { description, version } = z
      .object({ description: z.string(), version: z.number() })
      .parse(body)

    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
    })

    if (!task) {
      return c.json({ message: 'Task tidak ditemukan' }, 404)
    }

    // Optimistic locking
    if (task.version !== version) {
      return c.json(
        {
          message: 'Data sudah diubah oleh orang lain. Refresh dan coba lagi.',
          currentVersion: task.version,
        },
        409
      )
    }
    const oldDescription = task.description
    const updated = await prisma.task.update({
      where: { id },
      data: {
        description,
        version: { increment: 1 },
      },
    })

    await createAuditLog(id, user.id, 'description', oldDescription, description)

    return c.json({ message: 'Deskripsi berhasil diupdate', data: updated })
  } catch (error) {
    return c.json({ message: 'Gagal mengupdate deskripsi', error }, 400)
  }
})

// Upload attachment (Internal team)
tasks.patch('/:id/attachment', async (c) => {
  const user = c.get('user')

  if (user.role !== 'INTERNAL') {
    return c.json({ message: 'Hanya Internal Team yang bisa upload attachment' }, 403)
  }

  const { id } = c.req.param()

  try {
    const body = await c.req.json()
    const { attachment } = uploadAttachmentSchema.parse(body)

    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
    })

    if (!task) {
      return c.json({ message: 'Task tidak ditemukan' }, 404)
    }

    await createAuditLog(id, user.id, 'attachment', null, attachment)

    return c.json({ message: 'Attachment berhasil diupload' })
  } catch (error) {
    return c.json({ message: 'Gagal upload attachment', error }, 400)
  }
})


// Soft delete task (hanya PM)
tasks.delete('/:id', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json({ message: 'Hanya PM yang bisa menghapus task' }, 403)
  }

  const { id } = c.req.param()

  try {
    await prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return c.json({ message: 'Task berhasil dihapus' })
  } catch (error) {
    return c.json({ message: 'Gagal menghapus task', error }, 400)
  }
})

// Reassign task (hanya PM)
tasks.patch('/:id/assignee', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json({ message: 'Akses ditolak' }, 403)
  }

  const { id } = c.req.param()

  try {
    const { assigneeId } = await c.req.json()

    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
    })

    if (!task) {
      return c.json({ message: 'Task tidak ditemukan' }, 404)
    }

    const oldAssigneeId = task.assigneeId

    const updated = await prisma.task.update({
      where: { id },
      data: {
        assigneeId,
        version: { increment: 1 },
      },
    })

    await createAuditLog(
      id,
      user.id,
      'assigneeId',
      oldAssigneeId || null,
      assigneeId
    )

    return c.json({ message: 'Task berhasil di-reassign', data: updated })
  } catch (error) {
    return c.json({ message: 'Gagal reassign task', error }, 400)
  }
})

export default tasks