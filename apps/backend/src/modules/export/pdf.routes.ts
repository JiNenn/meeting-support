import { Router } from 'express';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireMeetingMember } from '@backend/middleware/requireMember';
import { renderMeetingPdf } from './pdf.service';

export const pdfRouter = Router();

pdfRouter.get('/:id/pdf', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  if (process.env.PDF_ENABLED !== 'true') return res.status(503).json({ error: 'pdf disabled' });
  try {
    const buf = await renderMeetingPdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.pdf"`);
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});
