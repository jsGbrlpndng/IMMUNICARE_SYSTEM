'use strict';

const PDFDocument = require('pdfkit');

const CLINICAL_GREEN = '#166534';
const CLINICAL_RED = '#DC2626';
const CLINICAL_AMBER = '#D97706';
const CLINICAL_TEAL = '#0F766E';
const CLINICAL_SLATE = '#475569';
const BORDER = '#CBD5E1';
const PANEL_FILL = '#F8FAFC';

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const safeText = (value) => String(value ?? '').trim() || '-';

const formatDateTime = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const formatMonthLabel = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const formatMetricLabel = (metricKey) => {
    switch (metricKey) {
        case 'populationGap':
            return 'Population Gap';
        case 'pentaGap':
            return 'Penta Gap';
        case 'mcvGap':
            return 'MCV Gap';
        case 'utilizationGap':
            return 'Utilization Gap';
        default:
            return String(metricKey || 'Performance Gap');
    }
};

class SpatialExportService {
    async buildPdf(payload = {}) {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 42,
            info: {
                Title: 'ImmuniCare Spatial DSS Export',
                Author: 'ImmuniCare'
            }
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));

        const completion = new Promise((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
        });

        this._render(doc, payload);
        doc.end();
        return completion;
    }

    _render(doc, payload) {
        const {
            mode = 'view',
            reportYear = null,
            reportMonth = null,
            snapshotMonth = null,
            selectedGapMetric = null,
            filters = {},
            summary = {},
            historicalTrendRows = [],
            mapImageDataUrl = null,
            analysis = {}
        } = payload;

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        let y = doc.page.margins.top;

        doc.fillColor(CLINICAL_GREEN).font('Helvetica-Bold').fontSize(18).text('ImmuniCare Spatial Decision Support Report', doc.page.margins.left, y, { width: pageWidth });
        y = doc.y + 6;

        doc.fillColor(CLINICAL_SLATE).font('Helvetica').fontSize(10);
        doc.text(`Generated: ${formatDateTime(new Date())}`, doc.page.margins.left, y);
        doc.text(`Mode: ${mode === 'analysis' ? 'Analytical Mode' : 'View Mode'}`, doc.page.margins.left + pageWidth - 180, y, { width: 180, align: 'right' });
        y = doc.y + 10;

        const periodLabel = snapshotMonth || (reportYear && reportMonth ? `${reportYear}-${String(reportMonth).padStart(2, '0')}-01` : null);
        const filterRows = [
            ['Reporting Period', formatMonthLabel(periodLabel)],
            ['Gap Metric', formatMetricLabel(selectedGapMetric)],
            ['Barangay', filters?.barangay && filters.barangay !== 'All' ? filters.barangay : 'Municipality-wide'],
            ['Age Group', filters?.ageGroup && filters.ageGroup !== 'All' ? filters.ageGroup : 'All'],
            ['Vaccine Type', filters?.vaccineType && filters.vaccineType !== 'All' ? filters.vaccineType : 'All'],
            ['Assigned BHW', filters?.assignedBhw && filters.assignedBhw !== 'All' ? filters.assignedBhw : 'All']
        ];

        doc.roundedRect(doc.page.margins.left, y, pageWidth, 82, 6).fillAndStroke(PANEL_FILL, BORDER);
        let blockY = y + 10;
        filterRows.forEach(([label, value], index) => {
            const columnX = index % 2 === 0 ? doc.page.margins.left + 12 : doc.page.margins.left + pageWidth / 2;
            if (index > 0 && index % 2 === 0) blockY += 19;
            doc.fillColor(CLINICAL_SLATE).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), columnX, blockY);
            doc.fillColor('#0F172A').font('Helvetica').fontSize(10).text(safeText(value), columnX, blockY + 9, { width: pageWidth / 2 - 24 });
        });
        y += 98;

        const summaryCards = [
            { label: 'Population Gap', value: summary.populationGap, tone: CLINICAL_TEAL },
            { label: 'Penta Gap', value: summary.pentaGap, tone: CLINICAL_RED },
            { label: 'MCV Gap', value: summary.mcvGap, tone: CLINICAL_AMBER },
            { label: 'Utilization Gap', value: summary.utilizationGap, tone: CLINICAL_GREEN }
        ];
        const gap = 10;
        const cardWidth = (pageWidth - gap * 3) / 4;
        summaryCards.forEach((card, index) => {
            const x = doc.page.margins.left + index * (cardWidth + gap);
            doc.roundedRect(x, y, cardWidth, 54, 6).fillAndStroke('#FFFFFF', BORDER);
            doc.fillColor(card.tone).font('Helvetica-Bold').fontSize(8).text(card.label.toUpperCase(), x + 10, y + 10, { width: cardWidth - 20 });
            doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(20).text(String(toNumber(card.value)), x + 10, y + 24, { width: cardWidth - 20 });
        });
        y += 72;

        doc.fillColor(CLINICAL_GREEN).font('Helvetica-Bold').fontSize(12).text('Map Snapshot', doc.page.margins.left, y);
        y += 18;

        if (mapImageDataUrl && /^data:image\/(png|jpeg|jpg);base64,/.test(mapImageDataUrl)) {
            try {
                const imageBuffer = Buffer.from(mapImageDataUrl.split(',')[1], 'base64');
                doc.image(imageBuffer, doc.page.margins.left, y, { fit: [pageWidth, 280], align: 'center', valign: 'center' });
                y += 292;
            } catch {
                doc.fillColor(CLINICAL_RED).font('Helvetica').fontSize(10).text('Map snapshot could not be rendered in this export.', doc.page.margins.left, y);
                y += 24;
            }
        } else {
            doc.roundedRect(doc.page.margins.left, y, pageWidth, 80, 6).fillAndStroke(PANEL_FILL, BORDER);
            doc.fillColor(CLINICAL_SLATE).font('Helvetica').fontSize(10).text('No viewport image was available for this export.', doc.page.margins.left + 12, y + 30);
            y += 96;
        }

        if (y > 680) {
            doc.addPage();
            y = doc.page.margins.top;
        }

        doc.fillColor(CLINICAL_GREEN).font('Helvetica-Bold').fontSize(12).text('Historical Trend Data', doc.page.margins.left, y);
        y += 18;

        if (!Array.isArray(historicalTrendRows) || historicalTrendRows.length === 0) {
            doc.roundedRect(doc.page.margins.left, y, pageWidth, 48, 6).fillAndStroke(PANEL_FILL, BORDER);
            const message = mode === 'analysis'
                ? 'No cached historical trend rows were available for the current analytical filter set.'
                : 'Historical trend data was not requested in View Mode.';
            doc.fillColor(CLINICAL_SLATE).font('Helvetica').fontSize(10).text(message, doc.page.margins.left + 12, y + 18);
            y += 64;
        } else {
            y = this._drawTrendTable(doc, y, pageWidth, historicalTrendRows);
        }

        const clusterCount = Array.isArray(analysis?.clusters) ? analysis.clusters.length : 0;
        const clusterNote = clusterCount > 0
            ? `Analytical Mode identified ${clusterCount} cluster(s) in the current filter set.`
            : 'Analytical Mode completed with no hotspot clusters for the current filter set.';

        if (y > 720) {
            doc.addPage();
            y = doc.page.margins.top;
        }

        doc.roundedRect(doc.page.margins.left, y, pageWidth, 44, 6).fillAndStroke('#FFFFFF', BORDER);
        doc.fillColor(CLINICAL_SLATE).font('Helvetica-Bold').fontSize(9).text('ANALYTICAL NOTE', doc.page.margins.left + 12, y + 10);
        doc.fillColor('#0F172A').font('Helvetica').fontSize(10).text(clusterNote, doc.page.margins.left + 12, y + 22, { width: pageWidth - 24 });

        doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(
            `ImmuniCare DSS Export • Generated ${formatDateTime(new Date())}`,
            doc.page.margins.left,
            doc.page.height - doc.page.margins.bottom + 6,
            { width: pageWidth, align: 'center' }
        );
    }

    _drawTrendTable(doc, startY, pageWidth, rows) {
        const columns = [
            { key: 'snapshotMonth', label: 'Month', width: 94 },
            { key: 'barangay', label: 'Barangay', width: 110 },
            { key: 'metricType', label: 'Metric', width: 112 },
            { key: 'metricValue', label: 'Value', width: 58 },
            { key: 'ageGroup', label: 'Age Group', width: 70 },
            { key: 'vaccineType', label: 'Vaccine', width: 70 }
        ];

        let y = startY;
        const rowHeight = 20;

        const drawHeader = () => {
            let x = doc.page.margins.left;
            doc.fillColor(CLINICAL_GREEN);
            doc.rect(x, y, pageWidth, rowHeight).fill();
            columns.forEach((column) => {
                doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text(column.label.toUpperCase(), x + 6, y + 6, { width: column.width - 12 });
                x += column.width;
            });
            y += rowHeight;
        };

        drawHeader();

        rows.slice(0, 16).forEach((row, index) => {
            if (y > 730) {
                doc.addPage();
                y = doc.page.margins.top;
                drawHeader();
            }

            let x = doc.page.margins.left;
            doc.fillColor(index % 2 === 0 ? '#FFFFFF' : PANEL_FILL);
            doc.rect(x, y, pageWidth, rowHeight).fill();

            const values = [
                formatMonthLabel(row.snapshotMonth),
                safeText(row.barangay),
                safeText(row.metricType),
                String(toNumber(row.metricValue)),
                safeText(row.ageGroup),
                safeText(row.vaccineType)
            ];

            values.forEach((value, columnIndex) => {
                const column = columns[columnIndex];
                doc.fillColor('#0F172A').font('Helvetica').fontSize(8.5).text(value, x + 6, y + 6, {
                    width: column.width - 12,
                    ellipsis: true
                });
                x += column.width;
            });

            doc.strokeColor(BORDER).lineWidth(0.5).moveTo(doc.page.margins.left, y + rowHeight).lineTo(doc.page.margins.left + pageWidth, y + rowHeight).stroke();
            y += rowHeight;
        });

        return y + 12;
    }
}

module.exports = SpatialExportService;
