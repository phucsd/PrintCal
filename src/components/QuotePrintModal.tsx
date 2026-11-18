'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Printer, Wrench } from 'lucide-react';
import { Button, Modal, Segmented } from './ui';
import { QuoteDocument, type QuoteDocumentProps } from './QuoteDocument';

/**
 * Xem trước & in phiếu báo giá / lệnh sản xuất.
 * Bản in được render riêng vào #print-root (con trực tiếp của <body>) – CSS @media print
 * ẩn toàn bộ phần còn lại của trang, nên chỉ in đúng tài liệu, đủ nhiều trang.
 */
export function QuotePrintModal({
  open,
  onClose,
  ...doc
}: Omit<QuoteDocumentProps, 'kind'> & { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<QuoteDocumentProps['kind']>('quote');
  if (!open) return null;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="xl"
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>Xem & in</span>
            <Segmented
              size="sm"
              className="w-auto"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'quote', label: <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" />Báo giá</span> },
                { value: 'job', label: <span className="inline-flex items-center gap-1"><Wrench className="w-3.5 h-3.5" />Lệnh SX</span> },
              ]}
            />
          </span>
        }
        footer={
          <>
            <Button onClick={onClose}>Đóng</Button>
            <Button variant="success" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
              In / Lưu PDF
            </Button>
          </>
        }
        bodyClassName="bg-slate-100 p-2 sm:p-5"
      >
        <div className="bg-white shadow-md mx-auto p-3 sm:p-8 max-w-[210mm] sm:min-h-[297mm] overflow-x-auto">
          <QuoteDocument kind={kind} {...doc} />
        </div>
      </Modal>
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="print-root">
            <QuoteDocument kind={kind} {...doc} />
          </div>,
          document.body
        )}
    </>
  );
}
