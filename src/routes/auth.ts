import {Hono} from 'hono'
import { z } from 'zod'
import { createHash } from 'crypto'
import prisma from '../lib/prisma'
import { signToken, verifyToken } from '../lib/jwt'

const auth = new Hono()

function hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex')
}

const registerSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['PM', 'INTERNAL', 'CLIENT']),
    department: z.enum(['PRODUCT', 'UIUX', 'FRONTEND', 'BACKEND']).optional(),
})

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
})

//Register
auth.post('/register', async (c) => {
    try{
        const body = await c.req.json()
        const data = registerSchema.parse(body)

        const existing = await prisma.user.findUnique({
            where: { email: data.email },
        })

        if(existing) {
            return c.json({message: 'Email sudah terdaftar'}, 400)
        }

        const user = await prisma.user.create({
            data: {
                ...data, 
                password: hashPassword(data.password),
            },
        })

        const token = signToken({
            id: user.id, 
            email: user.email,
            role: user.role,
            department: user.department,
        })

        return c.json({
            message: 'Registrasi Berhasil',
            token,
            user: {
                id: user.id, 
                name: user.name,
                email: user.email,
                role: user.role,
                department: user.department,
            },
        })
    }
    catch (error) {
        return c.json({message: 'Validasi Gagal', error}, 400)
    }
})

// Login
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const data = loginSchema.parse(body)

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (!user || user.password !== hashPassword(data.password)) {
      return c.json({ message: 'Email atau password salah' }, 401)
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
    })

    return c.json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    })
     } catch (error) {
    return c.json({ message: 'Validasi gagal', error }, 400)
  }
})

// Me (ambil data user yang sedang login)
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ message: 'Unauthorized' }, 401)
  }

  const token = authHeader.split(' ')[1]

  if (!token) {
    return c.json({ message: 'Unauthorized' }, 401)
  }

  try {
    const payload = verifyToken(token)

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
      },
    })

    return c.json({ user })
  } catch {
    return c.json({ message: 'Unauthorized' }, 401)
  }
})

export default auth