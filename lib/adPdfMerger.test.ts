import { PDFDocument } from 'pdf-lib';
import { processPdfWithDestinations } from './adPdfMerger';

describe('PDF Metadata sanitization', () => {
  it('sets Producer and Creator to Siddhi Prep and removes CreationDate and ModDate', async () => {
    // Create a dummy input PDF with default/custom metadata
    const sampleDoc = await PDFDocument.create();
    sampleDoc.addPage([200, 200]);
    sampleDoc.setProducer('Old Producer');
    sampleDoc.setCreator('Old Creator');
    sampleDoc.setCreationDate(new Date('2020-01-01T00:00:00Z'));
    sampleDoc.setModificationDate(new Date('2020-01-02T00:00:00Z'));
    const inputBuffer = Buffer.from(await sampleDoc.save());

    const resultBuffer = await processPdfWithDestinations(inputBuffer);
    const resultDoc = await PDFDocument.load(resultBuffer, { updateMetadata: false });

    expect(resultDoc.getProducer()).toBe('Siddhi Prep');
    expect(resultDoc.getCreator()).toBe('Siddhi Prep');
    expect(resultDoc.getCreationDate()).toBeUndefined();
    expect(resultDoc.getModificationDate()).toBeUndefined();
  });
});
