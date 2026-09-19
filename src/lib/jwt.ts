import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'secret'

export function signToken(payload: object): string {
    return jwt.sign(payload, JWT_SECRET, {expiresIn: '7d'})
}

export function verifyToken(token:string): any {
    return jwt.verify(token, JWT_SECRET)
}
