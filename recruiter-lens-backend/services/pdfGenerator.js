const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');

/**
 * Generates a comprehensive candidate profile PDF with all parsed data.
 * Returns a Promise that resolves to a Buffer.
 */
function generateCandidatePdf(candidateData) {
  return new Promise((resolve, reject) => {
    const {
      firstName = '',
      lastName = '',
      email = '',
      phone = '',
      currentEmployer = '',
      currentTitle = '',
      linkedinUrl = '',
      source = '',
      location = '',
      skills = [],
      about = '',
      experience = [],
      experienceTags = [],
      education = [],
      skillCategories = {},
      languages = [],
      githubUrl = '',
      githubProfile = null,
      avgTenure = '',
      currentTenure = '',
      totalExperience = '',
    } = candidateData;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const passthrough = new PassThrough();
    const chunks = [];

    passthrough.on('data', (chunk) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);

    doc.pipe(passthrough);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Colors
    const PRIMARY = '#1a1a2e';
    const SECONDARY = '#444444';
    const GRAY = '#555555';
    const LIGHT_GRAY = '#888888';
    const DIVIDER = '#cccccc';
    const SECTION_BG = '#f5f5f5';
    const ACCENT = '#2563eb';

    // ── Helper functions ──────────────────────────────────────────────────
    function drawDivider() {
      doc
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .strokeColor(DIVIDER)
        .lineWidth(0.5)
        .stroke();
      doc.moveDown(0.6);
    }

    function sectionTitle(title) {
      doc.moveDown(0.3);
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor(PRIMARY)
        .text(title);
      doc.moveDown(0.3);
      drawDivider();
    }

    function fieldRow(label, value) {
      if (!value) return;
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(SECONDARY)
        .text(label.toUpperCase(), { continued: false });
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor(PRIMARY)
        .text(value);
      doc.moveDown(0.4);
    }

    function checkNewPage(minSpace) {
      if (doc.y > 700 - (minSpace || 80)) {
        doc.addPage();
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TITLE
    // ═══════════════════════════════════════════════════════════════════════
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .fillColor(PRIMARY)
      .text('Candidate Profile', { align: 'center' });

    doc.moveDown(0.2);

    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    if (fullName) {
      doc
        .fontSize(16)
        .font('Helvetica')
        .fillColor(ACCENT)
        .text(fullName, { align: 'center' });
    }

    if (currentTitle || currentEmployer) {
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor(GRAY)
        .text(
          [currentTitle, currentEmployer].filter(Boolean).join(' at '),
          { align: 'center' }
        );
    }

    doc.moveDown(0.2);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(LIGHT_GRAY)
      .text(`Added via Recruiter Lens  •  ${dateStr}`, { align: 'center' });

    doc.moveDown(0.6);
    drawDivider();

    // ═══════════════════════════════════════════════════════════════════════
    // CONTACT INFORMATION
    // ═══════════════════════════════════════════════════════════════════════
    sectionTitle('Contact Information');

    fieldRow('Email', email);
    fieldRow('Phone', phone);
    fieldRow('Location', location);
    fieldRow('LinkedIn', linkedinUrl);
    if (githubUrl) fieldRow('GitHub', githubUrl);
    fieldRow('Source', source);

    // ═══════════════════════════════════════════════════════════════════════
    // ABOUT
    // ═══════════════════════════════════════════════════════════════════════
    if (about) {
      checkNewPage(100);
      sectionTitle('About');
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(SECONDARY)
        .text(about, { lineGap: 2 });
      doc.moveDown(0.5);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TENURE STATS
    // ═══════════════════════════════════════════════════════════════════════
    if (avgTenure || currentTenure || totalExperience) {
      checkNewPage(60);
      sectionTitle('Career Stats');
      const stats = [];
      if (totalExperience) stats.push(`Total Experience: ${totalExperience}`);
      if (currentTenure) stats.push(`Current Tenure: ${currentTenure}`);
      if (avgTenure) stats.push(`Avg Tenure: ${avgTenure}`);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(SECONDARY)
        .text(stats.join('    |    '));
      doc.moveDown(0.5);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPERIENCE
    // ═══════════════════════════════════════════════════════════════════════
    if (experience && experience.length > 0) {
      checkNewPage(120);
      sectionTitle(`Experience (${experience.length})`);

      for (let i = 0; i < experience.length; i++) {
        const exp = experience[i];
        checkNewPage(80);

        // Title + Company
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(PRIMARY)
          .text(exp.title || '(untitled role)', { continued: false });

        if (exp.company) {
          doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor(ACCENT)
            .text(exp.company);
        }

        // Date + Duration + Location on one line
        const meta = [];
        if (exp.dateRange) meta.push(exp.dateRange);
        if (exp.duration) meta.push(exp.duration);
        if (exp.location) meta.push(exp.location);
        if (meta.length > 0) {
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor(LIGHT_GRAY)
            .text(meta.join('  •  '));
        }

        // Funding stage
        if (exp.fundingStage) {
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .fillColor('#2563eb')
            .text(`💰 ${exp.fundingStage}`);
        }

        // Description
        if (exp.description) {
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor(GRAY)
            .text(exp.description, { lineGap: 1 });
        }

        if (i < experience.length - 1) doc.moveDown(0.6);
      }

      // Experience tags
      if (experienceTags && experienceTags.length > 0) {
        doc.moveDown(0.3);
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor(SECONDARY)
          .text('Tags: ', { continued: true })
          .font('Helvetica')
          .text(experienceTags.join(', '));
      }

      doc.moveDown(0.5);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EDUCATION
    // ═══════════════════════════════════════════════════════════════════════
    if (education && education.length > 0) {
      checkNewPage(100);
      sectionTitle(`Education (${education.length})`);

      for (let i = 0; i < education.length; i++) {
        const edu = education[i];
        checkNewPage(60);

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(PRIMARY)
          .text(edu.school || '(unknown school)');

        const details = [];
        if (edu.degree) details.push(edu.degree);
        if (edu.fieldOfStudy) details.push(edu.fieldOfStudy);
        if (details.length > 0) {
          doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor(SECONDARY)
            .text(details.join(' — '));
        }

        if (edu.dateRange) {
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor(LIGHT_GRAY)
            .text(edu.dateRange);
        }

        if (edu.description) {
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor(GRAY)
            .text(edu.description, { lineGap: 1 });
        }

        if (i < education.length - 1) doc.moveDown(0.4);
      }
      doc.moveDown(0.5);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SKILLS
    // ═══════════════════════════════════════════════════════════════════════
    if ((skills && skills.length > 0) || Object.keys(skillCategories || {}).length > 0) {
      checkNewPage(80);
      sectionTitle('Skills');

      if (skillCategories && Object.keys(skillCategories).length > 0) {
        for (const [cat, catSkills] of Object.entries(skillCategories)) {
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .fillColor(SECONDARY)
            .text(`${cat}: `, { continued: true })
            .font('Helvetica')
            .fillColor(GRAY)
            .text(catSkills.join(', '));
          doc.moveDown(0.2);
        }
      } else if (skills.length > 0) {
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor(GRAY)
          .text(skills.join(', '), { lineGap: 2 });
      }
      doc.moveDown(0.5);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LANGUAGES
    // ═══════════════════════════════════════════════════════════════════════
    if (languages && languages.length > 0) {
      checkNewPage(50);
      const langList = languages.map(l => (typeof l === 'string' ? l : l.language || String(l))).join(', ');
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(SECONDARY)
        .text('Languages: ', { continued: true })
        .font('Helvetica')
        .fillColor(GRAY)
        .text(langList);
      doc.moveDown(0.5);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GITHUB PROFILE
    // ═══════════════════════════════════════════════════════════════════════
    if (githubProfile && githubProfile.username) {
      checkNewPage(70);
      sectionTitle('GitHub Profile');

      fieldRow('Username', githubProfile.username);
      if (githubProfile.hireable) fieldRow('Open to Opportunities', 'Yes');
      if (githubProfile.followers != null) fieldRow('Followers', String(githubProfile.followers));
      if (githubProfile.totalCommits != null) fieldRow('Total Commits', String(githubProfile.totalCommits));
      doc.moveDown(0.3);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════════════════════════════════════
    doc.moveDown(1);
    drawDivider();
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(LIGHT_GRAY)
      .text(`Generated by Recruiter Lens on ${dateStr}`, { align: 'center' });

    doc.end();
  });
}

module.exports = { generateCandidatePdf };
