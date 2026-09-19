import { Hono } from 'hono'
import prisma from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'

const users = new Hono()

users.use('*', authMiddleware)

// Get all users (hanya PM)
users.get('/', async (c) => {
  const user = c.get('user')

  if (user.role !== 'PM') {
    return c.json({ message: 'Akses ditolak' }, 403)
  }

  try {
    const data = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
      },
    })

    return c.json({ data })
  } catch (error) {
    return c.json({ message: 'Gagal mengambil data users', error }, 500)
  }
})

export default users