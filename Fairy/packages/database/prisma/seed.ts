import { PrismaClient, MemoryKind, Mood, Scene } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedPersonas } from "./seedData/personas";

const prisma = new PrismaClient();

// demo-only 固定开发密码（上线前必须改密或实施注册/建号流程）
const DEV_USER_PASSWORD = "user123456";
const DEV_ADMIN_PASSWORD = "admin123456";

// 种子账号密码是公开的 demo 凭证：生产环境跑 seed 等于留两个已知密码的后门账号，一律拒绝
if (process.env.NODE_ENV === "production") {
  console.error(
    "refusing to seed: demo-only credentials must never be created in production. " +
      "Use the registration flow to create real accounts.",
  );
  process.exit(1);
}

const seedMovies = [
  {
    title: "星际穿越",
    director: "Christopher Nolan",
    year: 2014,
    moods: [Mood.HEALING, Mood.SUSPENSE],
    scenes: [Scene.RAINY_DAY, Scene.INSOMNIA],
    genres: ["科幻", "冒险"],
    quote: "我们曾经仰望星空，思考我们在宇宙中的位置。",
    stock: 3,
    totalStock: 5,
    coverUrl: null,
    description: "地球末日临近，一队探险家穿越虫洞寻找新家园。",
  },
  {
    title: "千与千寻",
    director: "宫崎骏",
    year: 2001,
    moods: [Mood.HEALING, Mood.RELAXED],
    scenes: [Scene.WEEKEND_AFTERNOON, Scene.HOME_ALONE],
    genres: ["动画", "奇幻"],
    quote: "不管前方的路有多苦，只要走的方向正确，都比站在原地更接近幸福。",
    stock: 4,
    totalStock: 6,
    coverUrl: null,
    description: "少女千寻在神秘世界寻找父母并成长的奇幻旅程。",
  },
  {
    title: "搏击俱乐部",
    director: "David Fincher",
    year: 1999,
    moods: [Mood.PASSIONATE, Mood.MELANCHOLY],
    scenes: [Scene.INSOMNIA, Scene.HOME_ALONE],
    genres: ["剧情", "惊悚"],
    quote: "工作占据了你人生的大部分，如果你不介意，那也无所谓。",
    stock: 2,
    totalStock: 4,
    coverUrl: null,
    description: "失眠的白领与肥皂商人组建地下搏击俱乐部，生活逐渐失控。",
  },
  {
    title: "爱在黎明破晓前",
    director: "Richard Linklater",
    year: 1995,
    moods: [Mood.ROMANTIC, Mood.RELAXED],
    scenes: [Scene.DATE_NIGHT, Scene.WEEKEND_AFTERNOON],
    genres: ["爱情", "剧情"],
    quote: "如果这个时刻能永远持续下去就好了。",
    stock: 5,
    totalStock: 5,
    coverUrl: null,
    description: "美国青年与法国女孩在维也纳火车邂逅，共度浪漫一夜。",
  },
  {
    title: "盗梦空间",
    director: "Christopher Nolan",
    year: 2010,
    moods: [Mood.SUSPENSE, Mood.PASSIONATE],
    scenes: [Scene.INSOMNIA, Scene.COMMUTE],
    genres: ["科幻", "动作"],
    quote: "你必须相信梦境是真实的，才能让它成真。",
    stock: 3,
    totalStock: 5,
    coverUrl: null,
    description: "盗梦者团队潜入多层梦境，执行一项几乎不可能的任务。",
  },
  {
    title: "海蒂和爷爷",
    director: "Alain Gsponer",
    year: 2015,
    moods: [Mood.HEALING],
    scenes: [Scene.RAINY_DAY, Scene.WEEKEND_AFTERNOON],
    genres: ["家庭", "剧情"],
    quote: "如果生活中有什么让你不快乐，就去看一看大山。",
    stock: 2,
    totalStock: 3,
    coverUrl: null,
    description: "小女孩海蒂被送往阿尔卑斯山与孤僻爷爷共同生活。",
  },
];

const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEV_ADMIN_ID = "00000000-0000-4000-8000-000000000002";

async function main(): Promise<void> {
  const userPasswordHash = bcrypt.hashSync(DEV_USER_PASSWORD, 10);
  const adminPasswordHash = bcrypt.hashSync(DEV_ADMIN_PASSWORD, 10);

  await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: { email: "user@fairy.local", role: "agent", passwordHash: userPasswordHash },
    create: {
      id: DEV_USER_ID,
      email: "user@fairy.local",
      role: "agent",
      passwordHash: userPasswordHash,
    },
  });

  await prisma.user.upsert({
    where: { id: DEV_ADMIN_ID },
    update: { email: "admin@fairy.local", role: "admin", passwordHash: adminPasswordHash },
    create: {
      id: DEV_ADMIN_ID,
      email: "admin@fairy.local",
      role: "admin",
      passwordHash: adminPasswordHash,
    },
  });

  await prisma.profile.upsert({
    where: { userId: DEV_USER_ID },
    update: {
      name: "铃",
      likeGenres: ["科幻", "悬疑"],
      styleTags: ["夜猫子"],
    },
    create: {
      userId: DEV_USER_ID,
      name: "铃",
      avatarUrl: null,
      styleTags: ["夜猫子"],
      likeGenres: ["科幻", "悬疑"],
      avoidFood: [],
      dietPreference: null,
      travelStyle: null,
    },
  });

  // 演示用户种子数据：绝区零角色（46 名，口径与来源见 personas.ts 头注释）。
  // bcrypt 只算一次、全员复用同一开发口令；user 按 email upsert，
  // profile 按 userId upsert，memories 按 (profileId, kind, content) 先查后插保证幂等。
  const personaPasswordHash = bcrypt.hashSync(DEV_USER_PASSWORD, 10);

  for (const persona of seedPersonas) {
    const email = `${persona.slug}@fairy.local`;

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, role: "user", passwordHash: personaPasswordHash },
    });

    await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        name: persona.name,
        styleTags: persona.styleTags,
        likeGenres: persona.likeGenres,
        avoidFood: persona.avoidFood,
        dietPreference: persona.dietPreference,
        travelStyle: persona.travelStyle,
      },
      create: {
        userId: user.id,
        name: persona.name,
        avatarUrl: null,
        styleTags: persona.styleTags,
        likeGenres: persona.likeGenres,
        avoidFood: persona.avoidFood,
        dietPreference: persona.dietPreference,
        travelStyle: persona.travelStyle,
      },
    });

    const memoryEntries: ReadonlyArray<readonly [MemoryKind, string]> = [
      [MemoryKind.PREFERENCE, persona.memories.preference],
      [MemoryKind.FACT, persona.memories.fact],
      [MemoryKind.INTENT, persona.memories.intent],
    ];

    for (const [kind, content] of memoryEntries) {
      const existing = await prisma.memory.findFirst({
        where: { profileId: user.id, kind, content },
      });
      if (!existing) {
        await prisma.memory.create({
          data: { profileId: user.id, kind, content },
        });
      }
    }
  }

  for (const movie of seedMovies) {
    await prisma.movie.upsert({
      where: { title: movie.title },
      update: {
        director: movie.director,
        year: movie.year,
        moods: movie.moods,
        scenes: movie.scenes,
        genres: movie.genres,
        quote: movie.quote,
        stock: movie.stock,
        totalStock: movie.totalStock,
        coverUrl: movie.coverUrl,
        description: movie.description,
      },
      create: movie,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
