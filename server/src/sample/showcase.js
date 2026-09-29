// Extra fictional postings used only by `npm run seed:sample`, so the UI shows every role type,
// experience level and deadline state. Companies are made up; links point at example.com.
const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
const inDays = (d) => {
  const t = new Date(Date.now() + d * 86400000);
  return `${t.getUTCDate()}/${t.getUTCMonth() + 1}/${t.getUTCFullYear()}`;
};

const job = (id, title, location, days, content) => ({
  id,
  title,
  company_name: ['Lumen Labs', 'Kestrel Health', 'Orbit Retail', 'Quanta Cloud'][id % 4],
  absolute_url: `https://example.com/showcase/${id}`,
  first_published: iso(days),
  location: { name: location },
  content,
});

export const SHOWCASE = {
  target: { key: 'sample:showcase', label: 'Showcase (sample)', company: 'Lumen Labs' },
  raw: {
    jobs: [
      job(801, 'UI/UX Design Intern', 'Bengaluru, India', 1,
        `<p>Design flows in Figma for our mobile app. Apply by ${inDays(3)}.</p><h3>Requirements</h3><ul><li>Portfolio with 2+ case studies</li><li>Figma, basic HTML/CSS</li></ul>`),
      job(802, 'DevOps Intern', 'Pune, India', 2,
        `<p>Help run Kubernetes clusters on AWS.</p><h3>What you need</h3><ul><li>Linux, Docker, Python or Go scripting</li><li>Curiosity about reliability</li></ul><p>Last date: ${inDays(12)}</p>`),
      job(803, 'QA Automation Intern', 'Remote - India', 3,
        `<p>Write Selenium and Playwright tests in JavaScript and Java.</p><h3>Qualifications</h3><ul><li>Pursuing B.Tech/B.E.</li><li>Basics of testing</li></ul><p>Applications close on ${inDays(6)}.</p>`),
      job(804, 'Security Analyst Intern', 'Hyderabad, India', 1,
        '<p>Assist our SOC team with threat monitoring.</p><h3>Requirements</h3><ul><li>Networking fundamentals</li><li>Python scripting</li></ul>'),
      job(805, 'iOS Developer', 'Bengaluru, India', 4,
        '<p>Build features in Swift and SwiftUI.</p><h3>Requirements</h3><ul><li>1+ years of experience shipping iOS apps</li></ul>'),
      job(806, 'Product Designer', 'Gurugram, India', 2,
        '<p>Own end-to-end design for checkout.</p><h3>Requirements</h3><ul><li>3+ years of experience in product design</li><li>Strong Figma skills</li></ul>'),
      job(807, 'Senior Site Reliability Engineer', 'Remote - India', 5,
        '<p>Scale our platform.</p><h3>Requirements</h3><ul><li>5+ years of experience with Kubernetes, Terraform, Go</li></ul>'),
      job(808, 'Frontend Engineer', 'Chennai, India', 1,
        `<p>React and TypeScript at scale.</p><h3>Requirements</h3><ul><li>1-3 years of experience with React</li></ul><p>Apply before ${inDays(5)}.</p>`),
    ],
  },
};
