import { Hono } from 'hono'
import prisma from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { z } from 'zod'
import type { AppVariables } from '../types'

const projects = new Hono<{ Variables: AppVariables }>()

projects.use('*', authMiddleware)

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

// Get all projects (sesuai role)
projects.get('/', async (c) => {
  const user = c.get('user')

  try {
    // Client hanya lihat project mereka sendiri
    // PM dan Internal lihat semua project yang mereka ikuti
    const data = await prisma.project.findMany({
      where: {
        deletedAt: null,
        members: {
          some: {
            userId: user.id,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
                department: true,
              },
            },
          },
        },
        tasks: {
          where: {
            deletedAt: null,
          },
        },
      },
    })

    // Kalau Client, return hanya aggregate metrics
    if (user.role === 'CLIENT') {
      const clientData = data.map((project) => {
        const totalTasks = project.tasks.length
        const doneTasks = project.tasks.filter(
          (t) => t.status === 'DONE'
        ).length
        const percentage =
          totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

        return {
          id: project.id,
          name: project.name,
          description: project.description,
          progress: `${percentage}% Complete`,
          tasks: project.tasks
            .filter((t) => t.clientVisible)
            .map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
            })),
        }
      })

      return c.json({ data: clientData })
    }

    return c.json({ data })
  } catch (error) {
    return c.json({ message: 'Gagal mengambil data project', error }, 500)
  }
})

// Get project by ID
projects.get('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  try {
    const project = await prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
        members: {
          some: {
            userId: user.id,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
                department: true,
              },
            },
          },
        },
        tasks: {
          where: { deletedAt: null },
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                department: true,
              },
            },
            dependencies: {
              include: {
                prerequisite: true,
              },
            },
          },
        },
      },
    })

    if (!project) {
      return c.json({ message: 'Project tidak ditemukan' }, 404)
    }

    // Data masking untuk Client
    if (user.role === 'CLIENT') {
      const totalTasks = project.tasks.length
      const doneTasks = project.tasks.filter((t) => t.status === 'DONE').length
      const percentage =
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

      return c.json({
        data: {
          id: project.id,
          name: project.name,
          description: project.description,
          progress: `${percentage}% Complete`,
          tasks: project.tasks
            .filter((t) => t.clientVisible)
            .map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
            })),
        },
      })
    }

    return c.json({ data: project })
  } catch (error) {
    return c.json({ message: 'Gagal mengambil data project', error }, 500)
  }
})

// Create project (hanya PM)
projects.post('/', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json({ message: 'Hanya PM yang bisa membuat project' }, 403)
  }

  try {
    const body = await c.req.json()
    const data = projectSchema.parse(body)

    const project = await prisma.project.create({
      data: {
        ...data,
        members: {
          create: {
            userId: user.id,
          },
        },
      },
    })

    return c.json({ message: 'Project berhasil dibuat', data: project }, 201)
  } catch (error) {
    return c.json({ message: 'Gagal membuat project', error }, 400)
  }
})

// Update project (hanya PM)
projects.put('/:id', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json({ message: 'Hanya PM yang bisa mengupdate project' }, 403)
  }

  const { id } = c.req.param()

  try {
    const body = await c.req.json()
    const data = projectSchema.parse(body)

    const project = await prisma.project.update({
      where: { id },
      data,
    })

    return c.json({ message: 'Project berhasil diupdate', data: project })
  } catch (error) {
    return c.json({ message: 'Gagal mengupdate project', error }, 400)
  }
})

// Delete project soft delete (hanya PM)
projects.delete('/:id', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json({ message: 'Hanya PM yang bisa menghapus project' }, 403)
  }

  const { id } = c.req.param()

  try {
    await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return c.json({ message: 'Project berhasil dihapus' })
  } catch (error) {
    return c.json({ message: 'Gagal menghapus project', error }, 400)
  }
})

// Add member to project (hanya PM)
projects.post('/:id/members', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json({ message: 'Akses ditolak' }, 403)
  }

  const { id } = c.req.param()

  try {
    const { userId } = await c.req.json()

    const existing = await prisma.projectMember.findFirst({
      where: { projectId: id, userId },
    })

    if (existing) {
      return c.json({ message: 'User sudah menjadi member' }, 400)
    }

    const member = await prisma.projectMember.create({
      data: { projectId: id, userId },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, department: true },
        },
      },
    })

    return c.json({ message: 'Member berhasil ditambahkan', data: member }, 201)
  } catch (error) {
    return c.json({ message: 'Gagal menambah member', error }, 400)
  }
})

// Remove member from project (hanya PM)
projects.delete('/:id/members/:userId', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json({ message: 'Akses ditolak' }, 403)
  }

  const { id, userId } = c.req.param()

  try {
    // Cek apakah user punya task aktif di project ini
    const activeTasks = await prisma.task.findMany({
      where: {
        projectId: id,
        assigneeId: userId,
        deletedAt: null,
        status: { not: 'DONE' },
      },
    })

    if (activeTasks.length > 0) {
      return c.json(
        {
          message: `Tidak bisa menghapus member karena masih memiliki ${activeTasks.length} task aktif. Selesaikan atau reassign task terlebih dahulu.`,
        },
        400
      )
    }

    await prisma.projectMember.deleteMany({
      where: { projectId: id, userId },
    })

    return c.json({ message: 'Member berhasil dihapus' })
  } catch (error) {
    return c.json({ message: 'Gagal menghapus member', error }, 400)
  }
})


export default projects