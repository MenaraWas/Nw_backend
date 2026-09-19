export type UserRole = 'PM' | 'INTERNAL' | 'CLIENT'
export type UserDepartment = 'PRODUCT' | 'UIUX' | 'FRONTEND' | 'BACKEND'

export type AuthUser = {
  id: string
  email: string
  role: UserRole
  department?: UserDepartment | null
}

export type AppVariables = {
  user: AuthUser
}
