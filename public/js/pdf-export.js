/**
 * PDF Export Utility (Client-side jsPDF and Server-side fallback)
 * Developed by Gururaj Surampalli
 */

window.PDFExporter = {
  // Export full scores table as formatted PDF
  exportScoresReport: function (attempts, stats, quizSettings) {
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
      // Fallback directly to server-side PDF generator endpoint
      window.location.href = '/api/admin/export/pdf';
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Top Gradient Header Bar
      doc.setFillColor(15, 23, 42); // #0f172a
      doc.rect(0, 0, pageWidth, 90, 'F');

      doc.setFillColor(99, 102, 241); // #6366f1
      doc.rect(0, 87, pageWidth, 4, 'F');

      // Title & Subtitle
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(56, 189, 248); // #38bdf8
      doc.text('ASSESSMENT SCORE REPORT', 40, 42);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184); // #94a3b8
      const titleStr = quizSettings ? quizSettings.title : 'Assessment';
      doc.text(`Quiz: ${titleStr}  |  Passing Threshold: ${quizSettings?.passing_percentage || 60}%`, 40, 64);

      // Attribution Badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(192, 132, 252); // #c084fc
      doc.text('Developed by Gururaj Surampalli', pageWidth - 40, 42, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 40, 64, { align: 'right' });

      // Analytics Summary Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(40, 105, pageWidth - 80, 55, 6, 6, 'FD');

      const colW = (pageWidth - 80) / 4;
      const metrics = [
        { label: 'TOTAL ATTEMPTS', val: String(stats?.totalAttempts || attempts.length), color: [15, 23, 42] },
        { label: 'PASS RATE', val: `${stats?.passRate || 0}%`, color: [16, 185, 129] },
        { label: 'AVERAGE SCORE', val: `${stats?.avgPercentage || 0}%`, color: [99, 102, 241] },
        { label: 'PASSED / FAILED', val: `${stats?.passedCount || 0} / ${stats?.failedCount || 0}`, color: [15, 23, 42] }
      ];

      metrics.forEach((m, idx) => {
        const x = 40 + (idx * colW) + (colW / 2);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(m.label, x, 122, { align: 'center' });

        doc.setFontSize(15);
        doc.setTextColor(m.color[0], m.color[1], m.color[2]);
        doc.text(m.val, x, 145, { align: 'center' });
      });

      // Prepare Table Data with USN and Semester
      const tableHeaders = [['#', 'Candidate Name', 'USN', 'Sem', 'Username', 'Score', 'Percentage', 'Status', 'Duration', 'Date']];
      const tableRows = attempts.map((att, index) => {
        const mins = Math.floor(att.time_spent_seconds / 60);
        const secs = att.time_spent_seconds % 60;
        const timeStr = `${mins}m ${secs}s`;
        const dateStr = new Date(att.created_at).toLocaleDateString();
        return [
          index + 1,
          att.full_name || 'N/A',
          att.usn || '-',
          att.semester || '-',
          att.username,
          `${att.score} / ${att.total_points}`,
          `${att.percentage}%`,
          att.passed ? 'PASSED' : 'FAILED',
          timeStr,
          dateStr
        ];
      });

      if (doc.autoTable) {
        doc.autoTable({
          head: tableHeaders,
          body: tableRows,
          startY: 175,
          margin: { left: 40, right: 40 },
          styles: {
            fontSize: 8.5,
            cellPadding: 5,
            font: 'helvetica'
          },
          headStyles: {
            fillColor: [30, 41, 59],
            textColor: [248, 250, 252],
            fontStyle: 'bold'
          },
          alternateRowStyles: {
            fillColor: [241, 245, 249]
          },
          didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 7) {
              if (data.cell.raw === 'PASSED') {
                data.cell.styles.textColor = [5, 150, 105];
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });
      }

      // Add Page Numbers & Signature on each page
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        
        doc.setDrawColor(203, 213, 225);
        doc.line(40, doc.internal.pageSize.getHeight() - 30, pageWidth - 40, doc.internal.pageSize.getHeight() - 30);
        
        doc.text(
          'Engineered & Developed by Gururaj Surampalli  •  Assessment Platform',
          40,
          doc.internal.pageSize.getHeight() - 16
        );

        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth - 40,
          doc.internal.pageSize.getHeight() - 16,
          { align: 'right' }
        );
      }

      doc.save(`Quiz_Scores_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.warn('Client-side jsPDF failed, using server PDF:', e);
      window.location.href = '/api/admin/export/pdf';
    }
  },

  // Export Individual Attempt Certificate / Detailed Report
  exportSingleAttemptReport: function (attempt) {
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
      alert('jsPDF library not yet loaded. Please try again.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Top Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 90, 'F');
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 87, pageWidth, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(56, 189, 248);
    doc.text('CANDIDATE ASSESSMENT REPORT', 40, 42);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`Candidate: ${attempt.full_name} (@${attempt.username})  |  USN: ${attempt.usn || '-'}  |  Sem: ${attempt.semester || '-'}`, 40, 64);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(192, 132, 252);
    doc.text('Developed by Gururaj Surampalli', pageWidth - 40, 42, { align: 'right' });

    // Result Summary
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(40, 105, pageWidth - 80, 60, 6, 6, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('SCORE ACHIEVED', 80, 125);
    doc.text('PERCENTAGE', 220, 125);
    doc.text('OUTCOME', 360, 125);
    doc.text('DURATION', 480, 125);

    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(`${attempt.score} / ${attempt.total_points}`, 80, 148);

    doc.setTextColor(99, 102, 241);
    doc.text(`${attempt.percentage}%`, 220, 148);

    if (attempt.passed) {
      doc.setTextColor(5, 150, 105);
      doc.text('PASSED', 360, 148);
    } else {
      doc.setTextColor(220, 38, 38);
      doc.text('FAILED', 360, 148);
    }

    const mins = Math.floor(attempt.time_spent_seconds / 60);
    const secs = attempt.time_spent_seconds % 60;
    doc.setTextColor(15, 23, 42);
    doc.text(`${mins}m ${secs}s`, 480, 148);

    // Questions Breakdown Table
    if (attempt.breakdown && doc.autoTable) {
      const rows = attempt.breakdown.map((b, i) => [
        i + 1,
        b.questionText,
        b.userSelected,
        b.correctAnswer,
        b.isCorrect ? 'Correct' : 'Incorrect',
        `${b.pointsAwarded}/${b.maxPoints}`
      ]);

      doc.autoTable({
        head: [['#', 'Question', 'Candidate Choice', 'Correct Answer', 'Status', 'Points']],
        body: rows,
        startY: 180,
        margin: { left: 40, right: 40 },
        styles: { fontSize: 8, cellPadding: 5 },
        headStyles: { fillColor: [30, 41, 59] },
        columnStyles: {
          1: { cellWidth: 160 },
          2: { cellWidth: 100 },
          3: { cellWidth: 100 }
        },
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 4) {
            data.cell.styles.textColor = data.cell.raw === 'Correct' ? [5, 150, 105] : [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });
    }

    doc.save(`Candidate_Report_${attempt.username}_${attempt.id}.pdf`);
  }
};
