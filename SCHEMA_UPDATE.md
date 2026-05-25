mkdir -p ~/db_backups

sudo mysqldump -u root -p --single-transaction --routines --triggers crm > ~/db_backups/crm_$(date +%F_%H-%M-%S).sql

restore
sudo gunzip < ~/db_backups/your_backup_file.sql.gz | mysql -u root -p crm