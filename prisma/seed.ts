import { PrismaClient, Role, Department } from "@prisma/client";
import { hash } from 'crypto';

const prisma = new PrismaClient()

function hashPassword(password:string): string {
    return hash('sha256', password)
}

async function main(){
    await prisma.auditLog.deleteMany();
    await prisma.taskDependency.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();


    const pm = await prisma.user.create({
        data: {
            name : 'Product Manager', 
            email: 'pm@nodewave.com',
            password: hashPassword('admin123'),
            role: Role.PM,
            department: Department.PRODUCT,
        },
    })
    
    const uiux = await prisma.user.create({
        data: {
            name: 'UI/UX Designer',
            email: 'uiux@nodewave.com',
            password: hashPassword('password123'),
            role: Role.INTERNAL,
            department: Department.UIUX,
        },
    })

    const frontend = await prisma.user.create({
    data: {
      name: 'Frontend Engineer',
      email: 'frontend@nodewave.com',
      password: hashPassword('password123'),
      role: Role.INTERNAL,
      department: Department.FRONTEND,
    },
  })

  const backend = await prisma.user.create({
    data: {
      name: 'Backend Engineer',
      email: 'backend@nodewave.com',
      password: hashPassword('password123'),
      role: Role.INTERNAL,
      department: Department.BACKEND,
    },
  })

  const client = await prisma.user.create({
    data: {
      name: 'Client Guest',
      email: 'client@nodewave.com',
      password: hashPassword('password123'),
      role: Role.CLIENT,
    },
  })

  // Buat project
  const project = await prisma.project.create({
    data: {
      name: 'NodeWave Dashboard',
      description: 'Project redesign dashboard NodeWave',
    },
  })

  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: pm.id },
      { projectId: project.id, userId: uiux.id },
      { projectId: project.id, userId: frontend.id },
      { projectId: project.id, userId: backend.id },
      { projectId: project.id, userId: client.id },
    ],
  })

  const taskA = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'UI Design',
      description: 'Buat desain UI dashboard',
      status: 'TODO',
      assigneeId: uiux.id,
      clientVisible: true,
    },
  })

  const taskB = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'Backend API',
      description: 'Buat REST API untuk dashboard',
      status: 'TODO',
      assigneeId: backend.id,
      clientVisible: false,
    },
  })

  const taskC = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'Frontend Slicing',
      description: 'Implementasi UI ke kode',
      status: 'BLOCKED',
      assigneeId: frontend.id,
      clientVisible: true,
    },
  })

  // Buat dependencies: Task C butuh Task A dan Task B selesai dulu
  await prisma.taskDependency.createMany({
    data: [
      { dependentId: taskC.id, prerequisiteId: taskA.id },
      { dependentId: taskC.id, prerequisiteId: taskB.id },
    ],
  })

  console.log('Seed berhasil!')
  console.log('Akun yang tersedia:')
  console.log('PM         : pm@nodewave.com / password123')
  console.log('UI/UX      : uiux@nodewave.com / password123')
  console.log('Frontend   : frontend@nodewave.com / password123')
  console.log('Backend    : backend@nodewave.com / password123')
  console.log('Client     : client@nodewave.com / password123')


}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())