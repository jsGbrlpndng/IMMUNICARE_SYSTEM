-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: localhost    Database: immunicare
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `approval_audit`
--

DROP TABLE IF EXISTS `approval_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `approval_audit` (
  `id` varchar(36) NOT NULL,
  `infant_id` varchar(36) NOT NULL,
  `action` enum('Approved','Rejected') NOT NULL,
  `approver_id` varchar(50) NOT NULL,
  `approver_role` enum('Midwife','Nurse','Admin') NOT NULL,
  `remarks` text,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_infant_id` (`infant_id`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_approver_id` (`approver_id`),
  CONSTRAINT `approval_audit_ibfk_1` FOREIGN KEY (`infant_id`) REFERENCES `infants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_trail`
--

DROP TABLE IF EXISTS `audit_trail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_trail` (
  `id` varchar(36) NOT NULL,
  `entity_type` enum('infant','vaccination','schedule','deferral') NOT NULL,
  `entity_id` varchar(36) NOT NULL,
  `action_type` enum('create','update','delete','status_change','vaccination_recorded','rescheduled','deferred','vaccination_validated') NOT NULL,
  `user_id` varchar(50) NOT NULL,
  `user_role` varchar(50) NOT NULL,
  `old_values` json DEFAULT NULL,
  `new_values` json DEFAULT NULL,
  `description` text,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_action_type` (`action_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `prevent_audit_update` BEFORE UPDATE ON `audit_trail` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Audit trail records are immutable and cannot be updated';
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `prevent_audit_delete` BEFORE DELETE ON `audit_trail` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Audit trail records are immutable and cannot be deleted';
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `authorization_audit`
--

DROP TABLE IF EXISTS `authorization_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `authorization_audit` (
  `audit_id` varchar(36) NOT NULL,
  `infant_id` varchar(36) NOT NULL,
  `vaccine_name` varchar(100) NOT NULL,
  `midwife_id` varchar(36) NOT NULL,
  `action_type` varchar(50) NOT NULL,
  `clinical_justification` text NOT NULL,
  `override_type` varchar(50) NOT NULL,
  `compliance_status` json NOT NULL,
  `session_metadata` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_immutable` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`audit_id`),
  KEY `idx_infant_id` (`infant_id`),
  KEY `idx_midwife_id` (`midwife_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_action_type` (`action_type`),
  KEY `idx_auth_vaccine_actor` (`vaccine_name`,`midwife_id`),
  CONSTRAINT `authorization_audit_ibfk_1` FOREIGN KEY (`infant_id`) REFERENCES `infants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `valid_action_type` CHECK ((`action_type` in (_utf8mb4'REQUEST',_utf8mb4'APPROVED',_utf8mb4'REJECTED',_utf8mb4'COMPLIANCE_VIOLATION',_utf8mb4'OVERRIDE',_utf8mb4'DEFERRED'))),
  CONSTRAINT `valid_override_type` CHECK ((`override_type` in (_utf8mb4'OVERDUE',_utf8mb4'OUT_OF_WINDOW',_utf8mb4'BLOCKED_DOSE')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `prevent_authorization_audit_update` BEFORE UPDATE ON `authorization_audit` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'AUDIT VIOLATION: Audit logs are immutable and cannot be modified';
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `prevent_authorization_audit_delete` BEFORE DELETE ON `authorization_audit` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'AUDIT VIOLATION: Audit logs are immutable and cannot be deleted';
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `authorization_sessions`
--

DROP TABLE IF EXISTS `authorization_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `authorization_sessions` (
  `session_id` varchar(36) NOT NULL,
  `midwife_id` varchar(36) NOT NULL,
  `infant_id` varchar(36) NOT NULL,
  `session_start` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `session_end` timestamp NULL DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text,
  `authorization_count` int DEFAULT '0',
  PRIMARY KEY (`session_id`),
  KEY `idx_midwife_id` (`midwife_id`),
  KEY `idx_infant_id` (`infant_id`),
  KEY `idx_session_start` (`session_start`),
  CONSTRAINT `authorization_sessions_ibfk_1` FOREIGN KEY (`infant_id`) REFERENCES `infants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doh_compliance_rules`
--

DROP TABLE IF EXISTS `doh_compliance_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doh_compliance_rules` (
  `rule_id` varchar(36) NOT NULL,
  `vaccine_code` varchar(50) NOT NULL,
  `vaccine_name` varchar(100) NOT NULL,
  `description` text,
  `min_age_days` int NOT NULL,
  `max_age_days` int DEFAULT NULL,
  `min_interval_days` int DEFAULT NULL,
  `allowed_early_days` int DEFAULT '0',
  `justification_required` tinyint(1) DEFAULT '0',
  `effective_date` date NOT NULL,
  `expiry_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(36) NOT NULL,
  PRIMARY KEY (`rule_id`),
  UNIQUE KEY `idx_vaccine_effective` (`vaccine_code`,`effective_date`),
  KEY `idx_vaccine_code` (`vaccine_code`),
  KEY `idx_vaccine_name` (`vaccine_name`),
  KEY `idx_effective_date` (`effective_date`),
  KEY `idx_expiry_date` (`expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_prevent_rule_update` BEFORE UPDATE ON `doh_compliance_rules` FOR EACH ROW BEGIN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Rules are immutable and cannot be modified.';
                    END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_prevent_rule_delete` BEFORE DELETE ON `doh_compliance_rules` FOR EACH ROW BEGIN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Deletion of regulatory rules is prohibited.';
                    END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `doh_compliance_rules_backup`
--

DROP TABLE IF EXISTS `doh_compliance_rules_backup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doh_compliance_rules_backup` (
  `rule_id` varchar(36) NOT NULL,
  `vaccine_name` varchar(100) NOT NULL,
  `rule_type` varchar(50) NOT NULL,
  `rule_value` json NOT NULL,
  `effective_date` date NOT NULL,
  `expiry_date` date DEFAULT NULL,
  `created_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`rule_id`),
  KEY `idx_vaccine_name` (`vaccine_name`),
  KEY `idx_rule_type` (`rule_type`),
  KEY `idx_effective_date` (`effective_date`),
  CONSTRAINT `valid_rule_type` CHECK ((`rule_type` in (_utf8mb4'MINIMUM_INTERVAL',_utf8mb4'CATCH_UP_PROTOCOL',_utf8mb4'ABSOLUTE_CONSTRAINT')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `immunization_logs`
--

DROP TABLE IF EXISTS `immunization_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `immunization_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `infant_id` varchar(36) DEFAULT NULL,
  `vaccine_name` varchar(100) NOT NULL,
  `scheduled_date` date NOT NULL,
  `actual_date` date DEFAULT NULL,
  `administered_by` varchar(36) DEFAULT NULL,
  `validated_by` varchar(36) DEFAULT NULL,
  `is_validated` tinyint(1) DEFAULT '0',
  `notes` text,
  PRIMARY KEY (`id`),
  KEY `administered_by` (`administered_by`),
  KEY `validated_by` (`validated_by`),
  KEY `immunization_logs_ibfk_1` (`infant_id`),
  CONSTRAINT `immunization_logs_ibfk_1` FOREIGN KEY (`infant_id`) REFERENCES `infants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `immunization_logs_ibfk_2` FOREIGN KEY (`administered_by`) REFERENCES `users` (`id`),
  CONSTRAINT `immunization_logs_ibfk_3` FOREIGN KEY (`validated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `infant_schedules`
--

DROP TABLE IF EXISTS `infant_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `infant_schedules` (
  `id` varchar(36) NOT NULL,
  `infant_id` varchar(36) NOT NULL,
  `vaccine_code` varchar(50) NOT NULL,
  `dose_number` int NOT NULL,
  `recommended_date` date NOT NULL,
  `earliest_allowed_date` date NOT NULL,
  `actual_date` date DEFAULT NULL,
  `status` enum('NOT_YET_DUE','DUE_SOON','DUE_TODAY','OVERDUE','COMPLETED','PENDING_VALIDATION','INELIGIBLE') NOT NULL DEFAULT 'NOT_YET_DUE',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_infant_vaccine_dose` (`infant_id`,`vaccine_code`,`dose_number`),
  UNIQUE KEY `idx_infant_vax_dose` (`infant_id`,`vaccine_code`,`dose_number`),
  UNIQUE KEY `unique_vax_dose` (`infant_id`,`vaccine_code`,`dose_number`),
  KEY `idx_infant_id` (`infant_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `infant_schedules_ibfk_1` FOREIGN KEY (`infant_id`) REFERENCES `infants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `infants`
--

DROP TABLE IF EXISTS `infants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `infants` (
  `id` varchar(36) NOT NULL,
  `reference_id` varchar(50) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `suffix` varchar(10) DEFAULT NULL,
  `mother_name` varchar(100) DEFAULT NULL,
  `father_name` varchar(100) DEFAULT NULL,
  `dob` date NOT NULL,
  `sex` enum('M','F') NOT NULL,
  `birth_setting` varchar(50) DEFAULT NULL,
  `purok` varchar(100) DEFAULT NULL,
  `barangay` varchar(100) DEFAULT 'Langgam',
  `caregiver_phone` varchar(20) NOT NULL,
  `caregiver_relationship` varchar(50) DEFAULT NULL,
  `birth_weight` decimal(5,2) DEFAULT NULL,
  `mother_tt_status` tinyint(1) DEFAULT '0',
  `status` enum('Active','Inactive','Transferred','Archived','Defaulter') DEFAULT 'Active',
  `created_by` varchar(36) DEFAULT NULL,
  `encoded_by_role` enum('BHW','Midwife','Nurse','Admin') DEFAULT NULL,
  `place_of_birth` varchar(255) DEFAULT NULL,
  `tt2_date` date DEFAULT NULL,
  `tt3_date` date DEFAULT NULL,
  `pregnancy_order` int DEFAULT NULL,
  `tt8_status` enum('Protected','Not Protected','Unknown') DEFAULT NULL,
  `tt_within_5_years` enum('Yes','No','Unknown') DEFAULT NULL,
  `cpab_status` enum('Protected','Not Protected','Pending') DEFAULT 'Pending',
  `last_tt_date` date DEFAULT NULL,
  `bcg_given` tinyint(1) DEFAULT '0',
  `hepatitis_b_given` tinyint(1) DEFAULT '0',
  `next_due_vaccine` varchar(255) DEFAULT NULL,
  `registration_status` enum('Draft','Pending','Approved','Rejected','Needs Correction','Deferred') DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `validation_feedback` json DEFAULT NULL,
  `current_address` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference_id` (`reference_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_registration_status` (`registration_status`),
  KEY `idx_status` (`status`),
  KEY `idx_dob` (`dob`),
  KEY `idx_barangay` (`barangay`),
  KEY `idx_reg_status_status` (`registration_status`,`status`),
  CONSTRAINT `infants_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `after_infant_insert` AFTER INSERT ON `infants` FOR EACH ROW BEGIN
    -- At Birth Vaccines
    INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date) 
    VALUES (NEW.id, 'BCG', NEW.dob), (NEW.id, 'Hepa B (Birth Dose)', NEW.dob);

    -- 6 Weeks (Penta 1, OPV 1, PCV 1)
    INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date)
    VALUES 
    (NEW.id, 'Pentavalent 1', DATE_ADD(NEW.dob, INTERVAL 6 WEEK)),
    (NEW.id, 'OPV 1', DATE_ADD(NEW.dob, INTERVAL 6 WEEK)),
    (NEW.id, 'PCV 1', DATE_ADD(NEW.dob, INTERVAL 6 WEEK));

    -- 10 Weeks (Penta 2, OPV 2, PCV 2)
    INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date)
    VALUES 
    (NEW.id, 'Pentavalent 2', DATE_ADD(NEW.dob, INTERVAL 10 WEEK)),
    (NEW.id, 'OPV 2', DATE_ADD(NEW.dob, INTERVAL 10 WEEK)),
    (NEW.id, 'PCV 2', DATE_ADD(NEW.dob, INTERVAL 10 WEEK));

    -- 14 Weeks (Penta 3, OPV 3, PCV 3, IPV 1)
    INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date)
    VALUES 
    (NEW.id, 'Pentavalent 3', DATE_ADD(NEW.dob, INTERVAL 14 WEEK)),
    (NEW.id, 'OPV 3', DATE_ADD(NEW.dob, INTERVAL 14 WEEK)),
    (NEW.id, 'PCV 3', DATE_ADD(NEW.dob, INTERVAL 14 WEEK)),
    (NEW.id, 'IPV 1', DATE_ADD(NEW.dob, INTERVAL 14 WEEK));

    -- 9 Months (Measles 1, IPV 2)
    INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date)
    VALUES 
    (NEW.id, 'Measles 1 (MCV1)', DATE_ADD(NEW.dob, INTERVAL 9 MONTH)),
    (NEW.id, 'IPV 2', DATE_ADD(NEW.dob, INTERVAL 9 MONTH));

    -- 12 Months (Measles 2)
    INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date)
    VALUES (NEW.id, 'Measles 2 (MCV2)', DATE_ADD(NEW.dob, INTERVAL 12 MONTH));
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `prevent_role_metadata_modification` BEFORE UPDATE ON `infants` FOR EACH ROW BEGIN
                IF OLD.encoded_by_role IS NOT NULL AND NEW.encoded_by_role != OLD.encoded_by_role THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Cannot modify encoded_by_role - field is immutable';
                END IF;
                
                IF OLD.created_by IS NOT NULL AND NEW.created_by != OLD.created_by THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Cannot modify created_by - field is immutable';
                END IF;
            END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `schedule_deferrals`
--

DROP TABLE IF EXISTS `schedule_deferrals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schedule_deferrals` (
  `id` varchar(36) NOT NULL,
  `infant_id` varchar(36) NOT NULL,
  `vaccine_name` varchar(100) NOT NULL,
  `original_due_date` date NOT NULL,
  `new_due_date` date DEFAULT NULL,
  `defer_type` enum('reschedule','contraindication','temporary_deferral') NOT NULL,
  `reason` text NOT NULL,
  `medical_note` text,
  `deferred_by` varchar(50) NOT NULL,
  `deferred_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_infant_id` (`infant_id`),
  KEY `idx_defer_type` (`defer_type`),
  KEY `idx_deferred_at` (`deferred_at`),
  CONSTRAINT `schedule_deferrals_ibfk_1` FOREIGN KEY (`infant_id`) REFERENCES `infants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `schedule_overrides`
--

DROP TABLE IF EXISTS `schedule_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schedule_overrides` (
  `id` varchar(36) NOT NULL,
  `infant_id` varchar(36) NOT NULL,
  `vaccine_name` varchar(100) NOT NULL,
  `original_due_date` date DEFAULT NULL,
  `new_due_date` date DEFAULT NULL,
  `clinical_reason` text NOT NULL,
  `midwife_id` varchar(50) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `authorization_status` varchar(50) DEFAULT 'PENDING',
  `compliance_metadata` json DEFAULT NULL,
  `audit_trail_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_infant_id` (`infant_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `audit_trail_id` (`audit_trail_id`),
  CONSTRAINT `schedule_overrides_ibfk_1` FOREIGN KEY (`infant_id`) REFERENCES `infants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `schedule_overrides_ibfk_2` FOREIGN KEY (`audit_trail_id`) REFERENCES `authorization_audit` (`audit_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_audit_logs`
--

DROP TABLE IF EXISTS `system_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_entity` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `before_value` text COLLATE utf8mb4_unicode_ci,
  `after_value` text COLLATE utf8mb4_unicode_ci,
  `details` json DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_admin_id` (`admin_id`),
  KEY `idx_action_type` (`action_type`),
  KEY `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_prevent_audit_update` BEFORE UPDATE ON `system_audit_logs` FOR EACH ROW BEGIN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT VIOLATION: System audit logs are immutable.';
                    END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_prevent_audit_delete` BEFORE DELETE ON `system_audit_logs` FOR EACH ROW BEGIN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT VIOLATION: Deletion of audit logs is strictly prohibited.';
                    END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_settings` (
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `value_type` enum('string','number','boolean','json') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'string',
  `category` enum('security','governance','notifications','general') COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `min_value` int DEFAULT NULL,
  `max_value` int DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`setting_key`),
  KEY `idx_category` (`category`),
  KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(36) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `role` enum('Admin','Midwife','BHW') NOT NULL,
  `assigned_barangay` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1',
  `password` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vaccinations`
--

DROP TABLE IF EXISTS `vaccinations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vaccinations` (
  `id` varchar(36) NOT NULL,
  `infant_id` varchar(36) NOT NULL,
  `schedule_id` varchar(36) DEFAULT NULL,
  `vaccine_name` varchar(100) NOT NULL,
  `vaccine_code` varchar(50) NOT NULL,
  `dose_number` int DEFAULT NULL,
  `batch_number` varchar(100) NOT NULL,
  `brand` varchar(100) DEFAULT NULL,
  `site_of_injection` varchar(100) NOT NULL,
  `vaccinator_id` varchar(50) NOT NULL,
  `vaccinator_name` varchar(200) NOT NULL,
  `administered_date` datetime NOT NULL,
  `notes` text,
  `validation_status` enum('PENDING_VALIDATION','VALIDATED') NOT NULL DEFAULT 'PENDING_VALIDATION',
  `is_early_override` tinyint(1) DEFAULT '0',
  `recorded_by_role` varchar(50) DEFAULT NULL,
  `validated_by_id` varchar(36) DEFAULT NULL,
  `validated_by_name` varchar(255) DEFAULT NULL,
  `validated_at` datetime DEFAULT NULL,
  `recorded_by` varchar(50) NOT NULL,
  `recorded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_infant_vaccine_date` (`infant_id`,`vaccine_name`,`administered_date`),
  KEY `idx_infant_id` (`infant_id`),
  KEY `idx_vaccine_name` (`vaccine_name`),
  KEY `idx_administered_date` (`administered_date`),
  CONSTRAINT `vaccinations_ibfk_1` FOREIGN KEY (`infant_id`) REFERENCES `infants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-24 12:37:35
