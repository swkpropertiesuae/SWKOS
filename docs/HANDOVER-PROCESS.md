# SWK Properties – Lead & Document Handover Procedure

**Owner:** Shabib Siraj, Managing Director · **Custodian:** SWK Admin · **Operator:** Mohammad Haseeb, Operations Manager
**Applies to:** client lead data (Ejari renewals, seekers, vacant units) and staff training material
**System:** SWK OS → CRM → CRM Property Vault → *Custody & Handover*

## 1. Purpose

Client contact data is a company asset and personal data under UAE PDPL. This procedure makes sure every
lead and document moves through a fixed chain of custody. Each transfer is approved by a named person and
recorded in the audit log, and no staff member ever receives a client's raw phone number.

## 2. Chain of custody

| Stage | Holder | Who can see it | Exit action |
|---|---|---|---|
| 1. Admin Custody | SWK Admin | Owner, Admin | Admin releases a desk or the full batch to the Operations Manager |
| 2. With Operations Manager | Haseeb | Owner, Admin, Manager | Manager dispatches leads (masked) and releases personal documents |
| 3. Staff | Named staff member | That staff member only | Work the lead, record the outcome |

Owner and Admin can recall any document back to Admin Custody at any stage.

## 3. Procedure

### Step 1 – Intake (Admin)
1. The lead data arrives encrypted and loads into **Admin Custody** automatically when the server starts. Admin receives a notification.
2. Admin checks the counts per desk against the source roster. For the November 2026 handover these are Meenakshi 2,300 · Saifullah 2,785 · Fareed 2,322 · Shahid 2,528 · Talha 1,909 · Umar 2,273 · Sanketh 1,136, for a total of **15,253**.
3. Admin uploads the documents (playbooks, field guides, calling booklets, roster index). Dialer workbooks are not uploaded: their leads are already in the CRM Vault, and the system refuses them on *Custody & Handover → Upload documents*. SWK file names are recognised automatically; for any other file, Admin chooses the type and staff member first. Files are stored in Cloudflare R2, never in the code repository.
4. Admin opens a sample of documents (*View*) to confirm they are complete and correct. A wrong file is deleted or replaced by uploading a file with the same name; a replaced document returns to Admin Custody.

### Step 2 – Release to the Operations Manager (Admin)
5. On *Custody & Handover*, Admin clicks **Release desk** for each verified desk, or **Release everything** once all desks are verified.
6. Haseeb is notified. Until this release, leads in Admin Custody cannot be dispatched to anyone. The system enforces this.

### Step 3 – Masking and dispatch to staff (Operations Manager)
7. **Leads:** in *Master Vault*, filter *Ejari 0–60D Dialer 2026* and the desk, select the leads, then click **Assign**. Before confirming, set the **visibility policy**:
   - **Always hidden from staff:** phone numbers and e-mail addresses. Staff call and WhatsApp through the masked bridge only.
   - **Hidden by default:** owner name and commission. Show them only when the deal stage needs it.
   - **Shown:** unit, floor, rent, expiry date and playbook, as needed for the conversation.
8. Dispatch in working batches (for example a week of calls at a time). Do not dispatch a whole desk at once. This keeps the data a staff member holds to what they are actively working.
9. **Documents:** release each **Personal Playbook** and **Field Guide** to its named staff member with **Release to staff**. The staff member reads it under *My Assigned Deals → My documents*. Staff see the document **exactly as issued**: every page, in its original design, shown page by page inside SWK OS. Each page carries the reader's name, e-mail and date as a watermark, and the viewer blocks downloading, copying, right-clicking and printing. The original file never leaves management.
10. **Calling Booklets contain raw client numbers. They stay with management and are never sent to staff, by e-mail, WhatsApp, USB or print.** The system blocks their release. Staff work the same leads through their masked queue.

### Step 4 – Execution and control (staff and Manager)
11. Staff record every call outcome in their queue. The Manager reviews progress daily.
12. Leads not worked within the agreed window are unassigned and re-dispatched by the Manager.
13. When a staff member leaves, the Manager unassigns all of their leads the same day. HR completes the employee separation.

## 4. Controls

- **Segregation of duties:** Admin cannot skip the Manager, and the Manager cannot take data out of Admin Custody.
- **Least privilege:** staff see only their own dispatched leads and view-only copies of their released documents. They never receive a file.
- **Audit trail:** every release, dispatch, recall and document download is logged with user and time. See *Administration → Audit*, and the *Access & usage* tab on each employee record.
- **Encryption:** data at rest is AES-256 encrypted. The handover file opens only with the `SWK_HANDOVER_KEY` server secret.
- **No side channels:** lead data must not be exported, screenshotted or forwarded outside SWK OS.

## 5. Loading a new handover (technical)

1. Put the source files in one folder, then run:
   `SWK_HANDOVER_KEY=<64-hex> npx tsx tools/data/build-handover-seed.ts <folder>`
2. Commit `data-seed/swk-handover.enc.bin` (leads only, about 2 MB) and deploy. On first start the new batch lands in Admin Custody. Leads that were already released or dispatched keep their stage.
3. Documents are not part of this file. Admin uploads them in SWK OS (step 3). This requires Cloudflare R2 to be switched on under *Settings → Storage*. The upload is refused without it, because the Cloudflare container's own disk is wiped on every restart.
4. The key is stored only as a Cloudflare secret. It is never kept in the repository, chat or e-mail.
