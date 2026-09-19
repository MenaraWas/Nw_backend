import type { Context, Next } from "hono";
import { verifyToken } from "../lib/jwt";

export async function authMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer')) {
        return c.json({message: 'Unauthorized'}, 401)
    }

    const token = authHeader.split(' ')[1]

    try{
        const payload = verifyToken(token)
        c.set('user', payload)
        await next()
    }catch(error){
        return c.json({message:"Token Invalid atau Expired"}, 401)
    }
}