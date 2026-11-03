// Données de démonstration fictives. Relançable : supprime puis recrée le compte de démo.
// Compte : demo@objectiva.fr / objectiva123
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const TZ = 'Africa/Abidjan';
const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const day = (offset: number) => {
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const year = Number(todayStr.slice(0, 4));

async function main() {
  await prisma.user.deleteMany({ where: { email: 'demo@objectiva.fr' } });
  const user = await prisma.user.create({
    data: {
      email: 'demo@objectiva.fr',
      passwordHash: await bcrypt.hash('objectiva123', 12),
      displayName: 'Aminata',
      timezone: TZ,
    },
  });
  const userId = user.id;

  // Projet professionnel
  const ecole = await prisma.goal.create({
    data: {
      userId,
      title: 'Présenter EcoleSaaS à trois établissements avant fin juin',
      description: 'Faire connaître EcoleSaaS auprès de directeurs d’écoles et obtenir un premier pilote.',
      motivation: 'Valider que le produit répond à un vrai besoin.',
      category: 'CARRIERE',
      horizon: 'PERSONNALISEE',
      startDate: day(-10),
      endDate: new Date(Date.UTC(year + 1, 5, 30)),
      priority: 'HAUTE',
      status: 'EN_COURS',
      // Progression mesurée : « 0 sur 3 démonstrations » (spec 003).
      progressMode: 'MESURE',
      measureUnit: 'démonstrations',
      startValue: 0,
      targetValue: 3,
      milestones: {
        create: [
          { title: 'Réaliser la première démonstration', dueDate: day(14) },
          { title: 'Réaliser la deuxième démonstration', dueDate: day(60) },
          { title: 'Réaliser la troisième démonstration', dueDate: day(120) },
        ],
      },
    },
    include: { milestones: true },
  });
  const firstDemo = ecole.milestones.find((m) => m.title.includes('première'))!;

  // Anglais
  const anglais = await prisma.goal.create({
    data: {
      userId,
      title: 'Améliorer mon anglais professionnel',
      description: 'Être à l’aise pour présenter un produit en anglais.',
      category: 'ETUDES',
      horizon: 'TRIMESTRE',
      startDate: day(-30),
      endDate: day(60),
      priority: 'MOYENNE',
      status: 'EN_COURS',
      milestones: {
        create: [
          { title: 'Terminer le module « Réunions »', dueDate: day(-5), completedAt: day(-6) },
          { title: 'Présenter EcoleSaaS en anglais à un ami', dueDate: day(25) },
        ],
      },
    },
  });

  // Sport
  const sport = await prisma.goal.create({
    data: {
      userId,
      title: 'Courir 10 km sans m’arrêter',
      category: 'SANTE',
      horizon: 'TRIMESTRE',
      startDate: day(-20),
      endDate: day(70),
      priority: 'MOYENNE',
      status: 'EN_COURS',
      milestones: { create: [{ title: 'Courir 5 km', dueDate: day(10) }] },
    },
  });

  // Lecture (sans prochaine action : l'accueil invitera à en ajouter une)
  await prisma.goal.create({
    data: {
      userId,
      title: 'Lire 12 livres cette année',
      category: 'PROJET_PERSONNEL',
      horizon: 'ANNEE',
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31)),
      priority: 'BASSE',
      status: 'EN_COURS',
    },
  });

  await prisma.task.createMany({
    data: [
      { userId, goalId: ecole.id, milestoneId: firstDemo.id, title: 'Préparer les comptes de démonstration', workDate: day(0), originalDate: day(0) },
      { userId, goalId: ecole.id, milestoneId: firstDemo.id, title: 'Appeler le directeur du collège Les Palmiers', workDate: day(1), originalDate: day(1), dueDate: day(3) },
      { userId, goalId: anglais.id, title: 'Pratiquer l’anglais 20 minutes', workDate: day(0), originalDate: day(0) },
      { userId, goalId: anglais.id, title: 'Regarder une conférence TED sans sous-titres', workDate: day(-1), originalDate: day(-2), rescheduleCount: 1 },
      { userId, goalId: sport.id, title: 'Footing 4 km', workDate: day(-1), originalDate: day(-1), status: 'DONE', completedAt: day(-1) },
      { userId, goalId: sport.id, title: 'Footing 5 km', workDate: day(2), originalDate: day(2) },
      { userId, title: 'Payer la facture d’électricité', workDate: day(0), originalDate: day(0), dueDate: day(0) },
      { userId, title: 'Trier les photos de vacances' },
    ],
  });

  // Événements (spec 004). Abidjan est à UTC : l'heure locale égale l'heure UTC.
  const at = (offset: number, hhmm: string) => new Date(`${day(offset).toISOString().slice(0, 10)}T${hhmm}:00.000Z`);
  const demo = await prisma.event.create({
    data: {
      userId,
      goalId: ecole.id,
      milestoneId: firstDemo.id,
      type: 'REUNION',
      title: 'Démonstration au collège Les Palmiers',
      startsAt: at(1, '10:00'),
      endsAt: at(1, '11:30'),
      location: 'Collège Les Palmiers, Cocody',
      participants: ['M. Koné (directeur)', 'Mme Traoré (secrétaire générale)'],
      agenda: 'Présenter EcoleSaaS, recueillir les besoins, proposer un pilote.',
      travelBeforeMinutes: 45,
      prepBeforeMinutes: 30,
    },
  });
  await prisma.task.create({
    data: {
      userId,
      goalId: ecole.id,
      milestoneId: firstDemo.id,
      eventId: demo.id,
      eventRole: 'PREPARATION',
      title: 'Préparer : Démonstration au collège Les Palmiers',
      workDate: day(0),
      originalDate: day(0),
    },
  });
  await prisma.event.create({
    data: {
      userId,
      type: 'APPEL',
      title: 'Appel avec le comptable',
      startsAt: at(0, '17:00'),
      endsAt: at(0, '17:30'),
      participants: ['M. Diallo'],
    },
  });

  // Budget du mois (spec 005). Montants en francs CFA (XOF), entiers.
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const on = (d: number) => new Date(`${todayStr.slice(0, 7)}-${String(d).padStart(2, '0')}T00:00:00Z`);
  const categories = await Promise.all(
    (
      [
        ['DEPENSE', ['Logement', 'Alimentation', 'Transport', 'Santé', 'Éducation', 'Loisirs', 'Autres dépenses']],
        ['REVENU', ['Salaire', 'Activité', 'Autres revenus']],
        ['EPARGNE', ['Épargne']],
      ] as const
    ).flatMap(([type, names]) => names.map((name) => prisma.budgetCategory.create({ data: { userId, type, name } }))),
  );
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  const especes = await prisma.account.create({ data: { userId, name: 'Espèces', kind: 'ESPECES', openingBalance: 150_000 } });
  const orange = await prisma.account.create({ data: { userId, name: 'Orange Money', kind: 'MOBILE_MONEY', openingBalance: 25_000 } });

  const loyer = await prisma.plannedOperation.create({
    data: { userId, type: 'DEPENSE', label: 'Loyer', plannedAmount: 80_000, dueDate: on(5), categoryId: cat('Logement'), accountId: especes.id, status: 'SOLDEE' },
  });
  const internet = await prisma.plannedOperation.create({
    data: { userId, type: 'DEPENSE', label: 'Internet', plannedAmount: 12_000, dueDate: on(8), categoryId: cat('Autres dépenses'), accountId: orange.id, status: 'PARTIELLE' },
  });
  await prisma.plannedOperation.createMany({
    data: [
      { userId, type: 'REVENU', label: 'Facture école pilote', plannedAmount: 200_000, dueDate: on(25), categoryId: cat('Activité'), accountId: orange.id },
      { userId, type: 'DEPENSE', label: 'Transport et impression', plannedAmount: 15_000, dueDate: day(0), categoryId: cat('Transport') },
      { userId, type: 'EPARGNE', label: 'Épargne projet', plannedAmount: 20_000, dueDate: on(28), categoryId: cat('Épargne') },
    ],
  });
  await prisma.transaction.createMany({
    data: [
      { userId, accountId: especes.id, categoryId: cat('Logement'), plannedOperationId: loyer.id, type: 'DEPENSE', amount: 80_000, date: on(5), label: 'Loyer' },
      { userId, accountId: orange.id, categoryId: cat('Autres dépenses'), plannedOperationId: internet.id, type: 'DEPENSE', amount: 5_000, date: on(8), label: 'Internet' },
      { userId, accountId: especes.id, categoryId: cat('Alimentation'), type: 'DEPENSE', amount: 12_500, date: on(2), label: 'Courses' },
      { userId, accountId: orange.id, categoryId: cat('Transport'), type: 'DEPENSE', amount: 3_500, date: on(3), label: 'Taxi' },
    ],
  });
  await prisma.envelope.createMany({
    data: [
      { userId, categoryId: cat('Transport'), month: new Date(`${monthStart}T00:00:00Z`), plannedAmount: 50_000 },
      { userId, categoryId: cat('Alimentation'), month: new Date(`${monthStart}T00:00:00Z`), plannedAmount: 60_000 },
      { userId, categoryId: cat('Loisirs'), month: new Date(`${monthStart}T00:00:00Z`), plannedAmount: 20_000 },
    ],
  });

  console.log('Données de démonstration créées. Connexion : demo@objectiva.fr / objectiva123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
