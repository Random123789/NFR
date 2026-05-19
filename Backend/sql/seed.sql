-- Insert demo seed data into all tables.

INSERT INTO accounts (recordId, moduleId, recordRevision, metaData, ownedBy, createdAt, createdBy, updatedAt, updatedBy, accountName, website, type, vertical, history) VALUES
('ACC-001', 'MOD-ACCOUNT', '1.2', 'Enterprise customer, high priority', 'John Doe', '2025-01-15', 'Admin', '2026-04-18', 'John Doe', 'Acme Corp', 'https://acmecorp.com', 'Customer', 'Enterprise', '[{"timestamp":"2025-01-15 10:00","user":"Admin","action":"Created","changes":"Account created"},{"timestamp":"2026-03-10 14:30","user":"John Doe","action":"Updated","changes":"Updated account type to Customer"},{"timestamp":"2026-04-18 09:15","user":"John Doe","action":"Comment","changes":"High priority customer, requires dedicated support"}]'),
('ACC-002', 'MOD-ACCOUNT', '1.0', 'Growing mid-market customer', 'Jane Smith', '2025-03-22', 'Admin', '2026-04-20', 'Jane Smith', 'TechStart Inc', 'https://techstart.io', 'Customer', 'Commercial', '[{"timestamp":"2025-03-22 11:30","user":"Admin","action":"Created","changes":"Account created"},{"timestamp":"2026-04-20 16:00","user":"Jane Smith","action":"Comment","changes":"Potential for upsell to enterprise tier"}]'),
('ACC-003', 'MOD-ACCOUNT', '2.1', 'Strategic account', 'Mike Chen', '2024-11-10', 'Admin', '2026-04-19', 'Mike Chen', 'Global Systems', 'https://globalsys.com', 'Customer', 'FSI', NULL),
('ACC-004', 'MOD-ACCOUNT', '1.0', 'New startup customer', 'Sarah Johnson', '2026-02-05', 'Sarah Johnson', '2026-04-21', 'Sarah Johnson', 'Innovation Labs', 'https://innovationlabs.io', 'Customer', 'Commercial', NULL);

INSERT INTO products (recordId, moduleId, recordRevision, metaData, ownedBy, createdAt, createdBy, updatedAt, updatedBy, productFamily, productName, productUrl, description, history) VALUES
('PRD-001', 'MOD-PRODUCT', '3.5', 'Flagship product line', 'Product Team', '2025-06-01', 'Admin', '2026-04-10', 'Product Team', 'Network Security', 'FortiGate', 'https://www.fortinet.com/products/next-generation-firewall', 'Next-generation firewall platform for network security, SD-WAN, and threat protection.', '[{"timestamp":"2025-06-01 10:00","user":"Admin","action":"Created","changes":"Product added to catalog"},{"timestamp":"2026-01-15 14:00","user":"Product Team","action":"Updated","changes":"Updated product URL to reflect new marketing page"},{"timestamp":"2026-04-10 11:30","user":"Product Team","action":"Comment","changes":"New FortiOS 7.6 version released with enhanced SD-WAN capabilities"}]'),
('PRD-002', 'MOD-PRODUCT', '2.8', 'Endpoint security solution', 'Product Team', '2025-05-15', 'Admin', '2026-04-18', 'Product Team', 'Endpoint Security', 'FortiClient', 'https://www.fortinet.com/products/endpoint-security/forticlient', 'Endpoint protection and VPN client for securing users and devices.', NULL),
('PRD-003', 'MOD-PRODUCT', '1.9', 'Authentication platform', 'Product Team', '2025-07-20', 'Admin', '2026-04-15', 'Product Team', 'Secure Access', 'FortiAuthenticator', 'https://www.fortinet.com/products/identity-access-management/fortiauthenticator', 'Identity and access management platform for authentication and SSO workflows.', NULL),
('PRD-004', 'MOD-PRODUCT', '4.2', 'Analytics and reporting', 'Product Team', '2025-08-05', 'Admin', '2026-04-20', 'Product Team', 'Security Operations', 'FortiAnalyzer', 'https://www.fortinet.com/products/management/fortianalyzer', 'Centralized analytics, logging, and reporting for security operations.', NULL);

INSERT INTO projects (recordId, moduleId, recordRevision, metaData, ownedBy, createdAt, createdBy, updatedAt, updatedBy, projectName, accountId, startDate, closeDate, seOwner, isClosed, stage, sfdc, sfdcValue, history) VALUES
('PRJ-001', 'MOD-PROJECT', '1.5', 'Multi-site deployment', 'Sarah Johnson', '2026-01-05', 'Sarah Johnson', '2026-04-20', 'Sarah Johnson', 'Enterprise FortiGate Deployment', 'ACC-001', '2026-01-10', '2026-06-30', 'Sarah Johnson', 0, 'Technical Validation', 'OPP-12345', 250000, '[{"timestamp":"2026-01-05 09:00","user":"Sarah Johnson","action":"Created","changes":"Project created with stage Technical Qualification"},{"timestamp":"2026-02-15 11:00","user":"Sarah Johnson","action":"Updated","changes":"Stage changed from Technical Qualification to Tender - RFP/RFI/RFQ"},{"timestamp":"2026-03-01 08:30","user":"Sarah Johnson","action":"Updated","changes":"Stage changed from Tender - RFP/RFI/RFQ to Technical Validation"},{"timestamp":"2026-04-20 15:45","user":"Sarah Johnson","action":"Comment","changes":"Deployment ahead of schedule, customer very satisfied"}]'),
('PRJ-002', 'MOD-PROJECT', '1.2', 'EMS implementation', 'Mike Chen', '2026-01-28', 'Mike Chen', '2026-04-21', 'Mike Chen', 'FortiClient EMS Rollout', 'ACC-002', '2026-02-01', '2026-05-15', 'Mike Chen', 0, 'Tender - RFP/RFI/RFQ', 'OPP-12346', 150000, NULL),
('PRJ-003', 'MOD-PROJECT', '1.0', 'SSO integration project', 'Alex Kumar', '2026-03-10', 'Alex Kumar', '2026-04-19', 'Alex Kumar', 'FortiAuthenticator SSO Integration', 'ACC-003', '2026-03-15', '2026-07-31', 'Alex Kumar', 0, 'Technical Qualification', 'OPP-12347', 180000, NULL);

INSERT INTO mantis (recordId, moduleId, recordRevision, metaData, ownedBy, createdAt, createdBy, updatedAt, updatedBy, description, mantisId, mantisUrl, category, mantisStatus, mantisRequestDate, mantisTargetDate, history) VALUES
('MANTIS-001', 'MOD-MANTIS', '1.3', 'MSP feature request', 'Sarah Johnson', '2026-03-15', 'Sarah Johnson', '2026-04-20', 'Sarah Johnson', 'FortiGate VDOM multi-tenancy enhancement for MSP environments', 'MANT-5678', 'https://mantis.fortinet.com/5678', 'Feature Request', 'Concept Commit', '2026-03-15', '2026-06-30', '[{"timestamp":"2026-03-15 13:00","user":"Sarah Johnson","action":"Created","changes":"Mantis record created with status New"},{"timestamp":"2026-03-20 10:30","user":"Product Team","action":"Updated","changes":"Status changed from New to Concept Commit"},{"timestamp":"2026-04-20 14:15","user":"Sarah Johnson","action":"Comment","changes":"Engineering team reviewing feasibility, expect feedback next week"}]'),
('MANTIS-002', 'MOD-MANTIS', '2.0', 'Government compliance requirement', 'Mike Chen', '2026-02-20', 'Mike Chen', '2026-04-18', 'Mike Chen', 'FortiGate enhanced encryption algorithms for government compliance', 'MANT-5679', 'https://mantis.fortinet.com/5679', 'Vulnerabilities', 'Scheduled', '2026-02-20', '2026-05-15', NULL),
('MANTIS-003', 'MOD-MANTIS', '1.0', 'SAML integration request', 'Alex Kumar', '2026-04-10', 'Alex Kumar', '2026-04-21', 'Alex Kumar', 'FortiAuthenticator custom SAML 2.0 provider integration', 'MANT-5680', 'https://mantis.fortinet.com/5680', 'Feature Request', 'New', '2026-04-10', '2026-07-20', NULL);

INSERT INTO knocks (recordId, moduleId, recordRevision, metaData, ownedBy, createdAt, createdBy, updatedAt, updatedBy, description, knockId, knockUrl, status, requestDate, targetDate, history) VALUES
('KNOCK-001', 'MOD-KNOCK', '1.1', 'API enhancement request', 'Mike Chen', '2026-03-25', 'Mike Chen', '2026-04-20', 'Mike Chen', 'FortiGate API rate limiting enhancement for high-traffic environments', 'KNK-9876', 'https://knock.fortinet.com/9876', 'Active', '2026-03-25', '2026-05-30', '[{"timestamp":"2026-03-25 11:00","user":"Mike Chen","action":"Created","changes":"Knock created with status Active"},{"timestamp":"2026-04-05 09:30","user":"Development Team","action":"Comment","changes":"Initial scoping completed, development scheduled for Q2"},{"timestamp":"2026-04-20 16:00","user":"Mike Chen","action":"Comment","changes":"Customer requesting priority treatment due to production impact"}]'),
('KNOCK-002', 'MOD-KNOCK', '1.0', 'Dashboard customization', 'Sarah Johnson', '2026-02-10', 'Sarah Johnson', '2026-04-16', 'Sarah Johnson', 'FortiAnalyzer custom dashboard widgets for threat analytics', 'KNK-9877', 'https://knock.fortinet.com/9877', 'Completed', '2026-02-10', '2026-04-15', NULL),
('KNOCK-003', 'MOD-KNOCK', '1.2', 'User management enhancement', 'Alex Kumar', '2026-04-05', 'Alex Kumar', '2026-04-21', 'Alex Kumar', 'FortiAuthenticator advanced user filtering and search capabilities', 'KNK-9878', 'https://knock.fortinet.com/9878', 'In Progress', '2026-04-05', '2026-06-10', NULL);

INSERT INTO cases (recordId, project, category, escalationType, escalationNote, closeDate, description, seOwner, assignedTo, priority, status) VALUES
('REC-001', 'PRJ-001', 'Pre-Sales', 'Escalation', 'Requires executive approval', NULL, 'Enterprise SD-WAN solution design and FortiGate sizing for 50 branch locations', 'Sarah Johnson', 'Sarah Johnson', 'High', 'New'),
('REC-002', 'PRJ-002', 'Pre-Sales', 'Monitoring', 'Customer deadline approaching', NULL, 'Zero Trust Network Access (ZTNA) architecture proposal with FortiClient EMS', 'Mike Chen', 'Mike Chen', 'Very High', 'Acknowledged'),
('REC-003', 'PRJ-003', 'Others', 'Others', NULL, NULL, 'Multi-factor authentication rollout strategy and FortiAuthenticator PoC', 'Alex Kumar', 'Alex Kumar', 'Medium', 'Monitoring'),
('REC-004', NULL, 'Post-Sales', 'Drop', NULL, '2026-04-16', 'Security Operations Center (SOC) visibility enhancement with FortiAnalyzer', 'Mike Chen', 'Mike Chen', 'Low', 'Closed-Resolved'),
('REC-005', 'PRJ-001', 'NFR', 'Re-Escalation', 'Competitive situation, needs immediate attention', NULL, 'Data center firewall refresh - FortiGate 3000 series evaluation and proposal', 'Sarah Johnson', 'Sarah Johnson', 'Very High', 'Escalated');

INSERT INTO case_entity_links (caseRecordId, entityType, entityRecordId, createdAt, createdBy) VALUES
('REC-001', 'account', 'ACC-001', '2026-04-21 08:45', 'Sarah Johnson'),
('REC-001', 'product', 'PRD-001', '2026-04-21 08:55', 'Sarah Johnson'),
('REC-001', 'mantis', 'MANTIS-001', '2026-04-21 09:00', 'Sarah Johnson'),
('REC-001', 'mantis', 'MANTIS-002', '2026-04-21 09:15', 'Sarah Johnson'),
('REC-002', 'account', 'ACC-002', '2026-04-21 09:20', 'Mike Chen'),
('REC-002', 'product', 'PRD-002', '2026-04-21 09:25', 'Mike Chen'),
('REC-002', 'knock', 'KNOCK-001', '2026-04-21 09:30', 'Mike Chen'),
('REC-002', 'knock', 'KNOCK-002', '2026-04-21 09:35', 'Mike Chen'),
('REC-003', 'account', 'ACC-003', '2026-04-21 09:36', 'Alex Kumar'),
('REC-003', 'product', 'PRD-003', '2026-04-21 09:38', 'Alex Kumar'),
('REC-003', 'mantis', 'MANTIS-003', '2026-04-21 09:40', 'Alex Kumar'),
('REC-003', 'knock', 'KNOCK-003', '2026-04-21 09:45', 'Alex Kumar'),
('REC-004', 'account', 'ACC-004', '2026-04-21 09:50', 'Mike Chen'),
('REC-004', 'product', 'PRD-004', '2026-04-21 09:55', 'Mike Chen'),
('REC-004', 'knock', 'KNOCK-002', '2026-04-21 09:58', 'Mike Chen'),
('REC-005', 'account', 'ACC-001', '2026-04-21 09:59', 'Sarah Johnson'),
('REC-005', 'mantis', 'MANTIS-001', '2026-04-21 10:00', 'Sarah Johnson'),
('REC-005', 'product', 'PRD-001', '2026-04-21 10:02', 'Sarah Johnson'),
('REC-005', 'mantis', 'MANTIS-002', '2026-04-21 10:03', 'Sarah Johnson'),
('REC-005', 'knock', 'KNOCK-003', '2026-04-21 10:05', 'Sarah Johnson');
