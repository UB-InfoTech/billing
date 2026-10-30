import React, { useCallback, useEffect, useState } from "react";
import api from "../axiosConfig";
import "bootstrap/dist/css/bootstrap.min.css";

const PAGE_SIZE = 10;

const OPERATION_LABELS = {
  "credit-note-create": "Credit Note creation",
  "credit-note-edit": "Credit Note edit",
  "credit-note-cancel": "Credit Note cancellation",
  "bulk-payment": "Bulk payment",
  "customer-summary-sync": "Customer totals refresh"
};

const STEP_LABELS = {
  "abort-transaction": "Stop the incomplete database transaction",
  "remove-credit-note": "Remove the incomplete Credit Note",
  "restore-credit-note": "Restore the Credit Note",
  "restore-invoice": "Restore invoice balances",
  "restore-customer-credit": "Restore customer credit",
  "restore-stock": "Restore product stock",
  "remove-invoice-payment": "Remove the incomplete invoice payment",
  "release-payment-reference": "Release the payment reference",
  "refresh-customer-financial-summary": "Refresh customer financial totals"
};

const RECORD_LABELS = {
  invoiceIds: "Invoice",
  creditNoteId: "Credit Note",
  clientIds: "Customer",
  productIds: "Product"
};

const moneySafeDate = value => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const labelForStep = value => STEP_LABELS[value]
  || String(value || "Review required").replace(/[-_]+/g, " ").replace(/^\w/, c => c.toUpperCase());

const errorMessage = error => error?.response?.data?.message
  || error?.message
  || "Something went wrong. Please try again.";

export default function FinancialRecoveryIssues() {
  const [status, setStatus] = useState("Open");
  const [page, setPage] = useState(1);
  const [issues, setIssues] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedIssue, setExpandedIssue] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [retryingIssueId, setRetryingIssueId] = useState("");
  const [retryError, setRetryError] = useState({ issueId: "", message: "" });
  const [refreshToken, setRefreshToken] = useState(0);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/api/financial-recovery-issues", {
        params: { status, page, limit: PAGE_SIZE }
      });
      setIssues(Array.isArray(response.data?.issues) ? response.data.issues : []);
      setPagination(response.data?.pagination || { page: 1, pages: 1, total: 0 });
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [status, page, refreshToken]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  const changeStatus = value => {
    setStatus(value);
    setPage(1);
    setExpandedIssue("");
    setResolutionNote("");
    setActionError("");
    setNotice("");
  };

  const startResolve = issue => {
    setExpandedIssue(current => current === issue._id ? "" : issue._id);
    setResolutionNote("");
    setActionError("");
    setNotice("");
  };

  const retryCustomerSummary = async issue => {
    setRetryingIssueId(issue._id);
    setRetryError({ issueId: "", message: "" });
    setNotice("");
    try {
      await api.post("/api/financial-recovery-issues/" + encodeURIComponent(issue._id) + "/retry-customer-sync");
      setNotice("Customer totals were refreshed successfully from the saved invoices and posted Credit Notes.");
      setExpandedIssue("");
      setResolutionNote("");
      setRefreshToken(value => value + 1);
    } catch (retryFailure) {
      setRetryError({ issueId: issue._id, message: errorMessage(retryFailure) });
    } finally {
      setRetryingIssueId("");
    }
  };

  const resolveIssue = async event => {
    event.preventDefault();
    const note = resolutionNote.trim();
    if (note.length < 10) {
      setActionError("Please describe the check or correction you completed (at least 10 characters).");
      return;
    }
    if (note.length > 1000) {
      setActionError("The note must be 1,000 characters or fewer.");
      return;
    }

    setResolving(true);
    setActionError("");
    try {
      await api.patch(
        "/api/financial-recovery-issues/" + encodeURIComponent(expandedIssue) + "/resolve",
        { resolutionNote: note }
      );
      setNotice("The issue was marked resolved. Your reconciliation note has been saved.");
      setExpandedIssue("");
      setResolutionNote("");
      setRefreshToken(value => value + 1);
    } catch (resolveError) {
      setActionError(errorMessage(resolveError));
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="financial-recovery-page container-fluid">
      <header className="financial-recovery-header">
        <div>
          <div className="financial-recovery-eyebrow">Financial safety</div>
          <h1 className="financial-recovery-title">Recovery issues</h1>
          <p className="financial-recovery-subtitle">
            Review financial recovery alerts and refresh customer totals when an automatic summary update could not complete.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => { setNotice(""); setRefreshToken(value => value + 1); }}
          disabled={loading}
        >
          <i className="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>
          Refresh
        </button>
      </header>

      <div className="alert alert-warning financial-recovery-guidance" role="note">
        <strong>Check before resolving.</strong> For customer-total alerts, use the refresh action to rebuild the summary from saved invoices and posted Credit Notes. For other alerts, compare the affected records and confirm any correction has actually been completed. Closing an issue does not change financial records.
      </div>

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          <div className="fw-semibold">We could not load the recovery issues.</div>
          <div className="mt-1">{error}</div>
          <button type="button" className="btn btn-outline-danger btn-sm mt-2" onClick={() => setRefreshToken(value => value + 1)}>
            Try again
          </button>
        </div>
      )}

      <section className="financial-recovery-list-panel" aria-label="Recovery issue list">
        <div className="financial-recovery-list-heading">
          <div>
            <h2 className="h5 mb-1">Issues to review</h2>
            <p className="text-secondary small mb-0">
              {loading ? "Loading issues…" : `${pagination.total} ${pagination.total === 1 ? "issue" : "issues"} in this view`}
            </p>
          </div>
          <div className="btn-group financial-recovery-filter" role="group" aria-label="Filter issues by status">
            {[
              { value: "Open", label: "Open" },
              { value: "Resolved", label: "Resolved" },
              { value: "All", label: "All issues" }
            ].map(option => (
              <button
                key={option.value}
                type="button"
                className={`btn btn-sm ${status === option.value ? "btn-primary" : "btn-outline-secondary"}`}
                aria-pressed={status === option.value}
                onClick={() => changeStatus(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="financial-recovery-empty">
            <span className="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true"></span>
            Loading recovery issues…
          </div>
        ) : error ? null : issues.length === 0 ? (
          <div className="financial-recovery-empty">
            <div className="financial-recovery-empty-icon"><i className="bi bi-check2-circle" aria-hidden="true"></i></div>
            <h3 className="h6">{status === "Open" ? "No open recovery issues" : "No recovery issues found"}</h3>
            <p className="text-secondary mb-0">
              {status === "Open"
                ? "There is nothing waiting for reconciliation in this view."
                : "Try another status filter to see more records."}
            </p>
          </div>
        ) : (
          <div className="financial-recovery-cards">
            {issues.map(issue => {
              const isExpanded = expandedIssue === issue._id;
              const isCustomerSummaryIssue = issue.operation === "customer-summary-sync";
              const isRetryingThisIssue = retryingIssueId === issue._id;
              const recordGroups = Object.entries(RECORD_LABELS)
                .flatMap(([key, label]) => {
                  const ids = key === "creditNoteId"
                    ? (issue[key] ? [issue[key]] : [])
                    : (Array.isArray(issue[key]) ? issue[key] : []);
                  return ids.length ? [{ label, ids }] : [];
                });

              return (
                <article className="financial-recovery-card" key={issue._id}>
                  <div className="financial-recovery-card-top">
                    <div className="financial-recovery-card-title-block">
                      <div className="financial-recovery-card-badges">
                        <span className={`badge ${issue.status === "Open" ? "text-bg-warning" : "text-bg-success"}`}>
                          {issue.status === "Open" ? "Needs review" : "Resolved"}
                        </span>
                        <span className="financial-recovery-kind">
                          {OPERATION_LABELS[issue.operation] || "Financial transaction"}
                        </span>
                      </div>
                      <h3 className="financial-recovery-summary">{issue.summary}</h3>
                      <div className="financial-recovery-date">
                        <i className="bi bi-clock me-1" aria-hidden="true"></i>
                        Reported {moneySafeDate(issue.createdAt)}
                      </div>
                    </div>
                    {issue.status === "Open" && (
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm financial-recovery-review-button"
                        onClick={() => isCustomerSummaryIssue ? retryCustomerSummary(issue) : startResolve(issue)}
                        disabled={isRetryingThisIssue}
                        aria-expanded={isCustomerSummaryIssue ? undefined : isExpanded}
                      >
                        {isCustomerSummaryIssue
                          ? (isRetryingThisIssue ? "Refreshing totals…" : "Refresh customer totals")
                          : (isExpanded ? "Close form" : "Review issue")}
                      </button>
                    )}
                  </div>

                  {isCustomerSummaryIssue && (
                    <p className="small text-secondary mb-3">
                      The invoice or payment was already saved. This alert only concerns the customer summary; refreshing it does not create or change a transaction.
                    </p>
                  )}

                  {retryError.issueId === issue._id && (
                    <div className="alert alert-danger py-2" role="alert">{retryError.message}</div>
                  )}

                  {issue.originalError && (
                    <div className="financial-recovery-cause">
                      <span className="financial-recovery-detail-label">What triggered the alert</span>
                      <p className="mb-0">{issue.originalError}</p>
                    </div>
                  )}

                  {Array.isArray(issue.recoveryFailures) && issue.recoveryFailures.length > 0 && (
                    <div className="financial-recovery-failures">
                      <div className="financial-recovery-detail-label mb-2">Steps needing attention</div>
                      {issue.recoveryFailures.map((failure, index) => (
                        <div className="financial-recovery-failure" key={`${failure.step}-${index}`}>
                          <div className="financial-recovery-failure-mark"><i className="bi bi-exclamation-lg" aria-hidden="true"></i></div>
                          <div className="financial-recovery-failure-copy">
                            <div className="fw-semibold">{labelForStep(failure.step)}</div>
                            <div className="small text-secondary">{failure.message}</div>
                            {failure.entityId && (
                              <div className="financial-recovery-id">Record reference: {failure.entityId}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {recordGroups.length > 0 && (
                    <details className="financial-recovery-records">
                      <summary>Affected record references</summary>
                      <div className="financial-recovery-record-grid">
                        {recordGroups.map(group => (
                          <div key={group.label}>
                            <span className="financial-recovery-detail-label">{group.label}</span>
                            {group.ids.map(id => (
                              <code key={String(id)} title={String(id)}>{String(id)}</code>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {issue.status === "Resolved" && (
                    <div className="financial-recovery-resolution">
                      <div className="fw-semibold">Reconciliation recorded</div>
                      <p className="mb-1">{issue.resolutionNote || "No resolution note was recorded."}</p>
                      <span className="small text-secondary">
                        {issue.resolvedAt ? "Resolved " + moneySafeDate(issue.resolvedAt) : ""}
                      </span>
                    </div>
                  )}

                  {isExpanded && !isCustomerSummaryIssue && (
                    <form className="financial-recovery-resolve-form" onSubmit={resolveIssue}>
                      <h4 className="h6 mb-2">Record the reconciliation</h4>
                      <p className="small text-secondary">
                        First confirm the actual records are correct. Describe what you checked or corrected; this note becomes part of the financial audit trail.
                      </p>
                      <label className="form-label" htmlFor={`resolution-${issue._id}`}>What did you check or correct?</label>
                      <textarea
                        id={`resolution-${issue._id}`}
                        className="form-control"
                        rows={3}
                        maxLength={1000}
                        value={resolutionNote}
                        onChange={event => setResolutionNote(event.target.value)}
                        placeholder="Example: Checked invoice payments and corrected the product stock count."
                        required
                      />
                      <div className="d-flex justify-content-between flex-wrap gap-2 mt-1">
                        <span className="small text-secondary">Enter at least 10 characters.</span>
                        <span className="small text-secondary">{resolutionNote.length}/1000</span>
                      </div>
                      {actionError && <div className="alert alert-danger py-2 mt-3 mb-0" role="alert">{actionError}</div>}
                      <div className="d-flex justify-content-end gap-2 mt-3">
                        <button type="button" className="btn btn-light" onClick={() => { setExpandedIssue(""); setResolutionNote(""); setActionError(""); }}>
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={resolving || resolutionNote.trim().length < 10}>
                          {resolving ? "Saving…" : "Mark as resolved"}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {!loading && !error && pagination.pages > 1 && (
          <div className="financial-recovery-pagination">
            <span className="small text-secondary">Page {pagination.page} of {pagination.pages}</span>
            <div className="btn-group" role="group" aria-label="Recovery issue pages">
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(value => Math.min(pagination.pages, value + 1))}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
