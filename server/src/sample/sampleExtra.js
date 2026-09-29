// Fictional postings for the newer sources, in each API's real shape. Merged into SAMPLE.
import { rssItems, parseXml } from '../lib/xml.js';

const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
const unix = (d) => Math.floor((Date.now() - d * 86400000) / 1000);
const rfc822 = (d) => new Date(Date.now() - d * 86400000).toUTCString();

const WWR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>WWR</title>
<item>
  <title>Bytewise: Junior Full Stack Developer</title>
  <region>Anywhere in the World</region><country></country><state></state><skills>react, node</skills>
  <category>Full-Stack Programming</category><type>Full-Time</type>
  <description>&lt;p&gt;Ship features across our Next.js app. 0-1 years of experience is fine.&lt;/p&gt;</description>
  <pubDate>${rfc822(1)}</pubDate>
  <guid>https://example.com/wwr/bytewise-junior-full-stack</guid>
  <link>https://example.com/wwr/bytewise-junior-full-stack</link>
</item>
<item>
  <title>Statewide: Junior Backend Engineer</title>
  <region>USA Only</region><country></country>
  <category>Back-End Programming</category><type>Full-Time</type>
  <description>&lt;p&gt;US only.&lt;/p&gt;</description>
  <pubDate>${rfc822(1)}</pubDate>
  <guid>https://example.com/wwr/statewide-junior-backend</guid>
  <link>https://example.com/wwr/statewide-junior-backend</link>
</item>
</channel></rss>`;

const PERSONIO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
  <position>
    <id>1201</id><subcompany>Tessera GmbH</subcompany><office>Pune</office>
    <department>Engineering</department><name>Working Student - Software Development</name>
    <jobDescriptions><jobDescription><name>Your tasks</name><value>&lt;p&gt;Build internal tools in TypeScript.&lt;/p&gt;</value></jobDescription></jobDescriptions>
    <employmentType>intern</employmentType><seniority>student</seniority><schedule>part-time</schedule>
    <createdAt>${iso(2)}</createdAt>
  </position>
  <position>
    <id>1202</id><subcompany>Tessera GmbH</subcompany><office>Munich</office>
    <name>Backend Engineer</name><employmentType>permanent</employmentType><seniority>experienced</seniority>
    <createdAt>${iso(2)}</createdAt>
  </position>
</workzag-jobs>`;

const HN_POST_1 =
  'Orbital Labs | Software Engineer (New Grad), Senior Platform Engineer | Bengaluru, India | ONSITE | https://example.com<p>We build satellite scheduling software. New grads welcome.</p>';
const HN_POST_2 = 'Driftwood | Junior Frontend Engineer | REMOTE<p>Remote, but you must be based in the US.</p>';
const HN_POST_3 = 'Just a reply without the pipe format';

export const SAMPLE_EXTRA = {
  amazon: {
    target: { key: 'sample:amazon', label: 'Amazon (sample)', company: 'Amazon' },
    raw: {
      jobs: [
        {
          id: 'amz-1',
          id_icims: '3001001',
          title: 'Software Dev Engineer Intern',
          city: 'Bengaluru',
          country_code: 'IND',
          normalized_location: 'Bengaluru, Karnataka, IND',
          location: 'IN, KA, Bengaluru',
          posted_date: new Date(Date.now() - 3 * 86400000).toDateString(),
          description: 'Work with an Amazon team on a real project for 6 months.',
          basic_qualifications: 'Currently pursuing a Bachelor’s degree in Computer Science.',
          job_path: '/en/jobs/3001001/software-dev-engineer-intern',
          job_category: 'Software Development',
        },
        {
          id: 'amz-2',
          id_icims: '3001002',
          title: 'Financial Analyst Intern',
          country_code: 'IND',
          normalized_location: 'Bengaluru, Karnataka, IND',
          posted_date: new Date(Date.now() - 3 * 86400000).toDateString(),
          description: 'Finance internship.',
          job_path: '/en/jobs/3001002/financial-analyst-intern',
        },
      ],
    },
  },
  microsoft: {
    target: { key: 'sample:microsoft', label: 'Microsoft (sample)', company: 'Microsoft' },
    raw: {
      positions: [
        {
          id: 1970000000000001,
          name: 'Software Engineering Intern',
          locations: ['Hyderabad, Telangana, India'],
          standardizedLocations: ['IN'],
          postedTs: Math.floor(Date.now() / 1000) - 2 * 86400,
          department: 'Software Engineering',
          workLocationOption: 'onsite',
          positionUrl: '/careers/job/1970000000000001',
        },
        {
          id: 1970000000000002,
          name: 'Principal Software Engineer',
          locations: ['Bangalore, Karnataka, India'],
          standardizedLocations: ['IN'],
          postedTs: Math.floor(Date.now() / 1000) - 2 * 86400,
          positionUrl: '/careers/job/1970000000000002',
        },
      ],
    },
  },
  weworkremotely: {
    target: { key: 'sample:weworkremotely', label: 'We Work Remotely (sample)' },
    raw: rssItems(WWR_XML),
  },
  workingnomads: {
    target: { key: 'sample:workingnomads', label: 'Working Nomads (sample)' },
    raw: [
      {
        url: 'https://example.com/workingnomads/job/go/5501/',
        title: 'Graduate Data Analyst',
        description: '<p>SQL and dashboards.</p>',
        company_name: 'Northwind Metrics',
        category_name: 'Data',
        tags: 'sql,python',
        location: 'EMEA or APAC time zones only',
        pub_date: iso(3),
      },
    ],
  },
  themuse: {
    target: { key: 'sample:themuse', label: 'The Muse (sample)' },
    raw: {
      results: [
        {
          id: 7771,
          name: 'Software Engineering Intern',
          company: { name: 'Globex' },
          locations: [{ name: 'Hyderabad, India' }],
          levels: [{ name: 'Internship' }],
          categories: [{ name: 'Software Engineering' }],
          contents: '<p>Summer internship.</p>',
          refs: { landing_page: 'https://example.com/muse/7771' },
          publication_date: iso(4),
        },
        {
          id: 7772,
          name: 'Associate Software Engineer',
          company: { name: 'Globex' },
          locations: [{ name: 'Flexible / Remote' }],
          levels: [{ name: 'Entry Level' }],
          refs: { landing_page: 'https://example.com/muse/7772' },
          publication_date: iso(4),
        },
      ],
    },
  },
  workable: {
    target: { key: 'sample:workable', label: 'Lattice Works (sample)', company: 'Lattice Works', token: 'latticeworks' },
    raw: {
      name: 'Lattice Works',
      jobs: [
        {
          title: 'Backend Developer Intern',
          shortcode: 'AB12CD',
          employment_type: 'Internship',
          telecommuting: false,
          department: 'Engineering',
          url: 'https://example.com/workable/AB12CD',
          published_on: iso(1).slice(0, 10),
          city: 'Noida',
          country: 'India',
          locations: [{ country: 'India', countryCode: 'IN', city: 'Noida', region: 'Uttar Pradesh' }],
          experience: 'Internship',
          full_description: '<p>Python and Postgres.</p>',
        },
      ],
    },
  },
  recruitee: {
    target: { key: 'sample:recruitee', label: 'Helio (sample)', company: 'Helio', token: 'helio' },
    raw: {
      offers: [
        {
          id: 301,
          slug: 'graduate-software-engineer',
          status: 'published',
          title: 'Graduate Software Engineer',
          company_name: 'Helio',
          city: 'Chennai',
          country: 'India',
          location: 'Chennai, India',
          remote: false,
          description: '<p>Rotation programme across teams.</p>',
          requirements: '<p>B.Tech 2026/2027.</p>',
          employment_type_code: 'fulltime_permanent',
          experience_code: 'entry_level',
          careers_url: 'https://example.com/recruitee/graduate-software-engineer',
          published_at: iso(2),
        },
      ],
    },
  },
  personio: {
    target: { key: 'sample:personio', label: 'Tessera (sample)', company: 'Tessera', host: 'tessera.jobs.personio.de' },
    raw: parseXml(PERSONIO_XML),
  },
  workday: {
    target: { key: 'sample:workday', label: 'Megacorp (sample)', company: 'Megacorp', host: 'megacorp.wd5.myworkdayjobs.com', site: 'External' },
    raw: {
      jobPostings: [
        { title: 'Software Engineering Intern', externalPath: '/job/Bangalore/SWE-Intern_R1', locationsText: 'Bangalore, Karnataka, India', postedOn: 'Posted 2 Days Ago' },
        { title: 'Software Engineering Intern', externalPath: '/job/Austin/SWE-Intern_R2', locationsText: 'Austin, TX', postedOn: 'Posted Today' },
      ],
    },
  },
  hn: {
    target: { key: 'sample:hn', label: 'HN Who is Hiring (sample)' },
    raw: {
      threadTitle: 'Ask HN: Who is hiring? (September 2026)',
      children: [
        { id: 9100001, type: 'comment', created_at: iso(5), text: HN_POST_1 },
        { id: 9100002, type: 'comment', created_at: iso(5), text: HN_POST_2 },
        { id: 9100003, type: 'comment', created_at: iso(5), text: HN_POST_3 },
      ],
    },
  },
};
