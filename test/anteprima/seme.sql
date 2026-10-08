INSERT INTO punti_controllo (nome, tipo, temp_min, temp_max) VALUES ('Frigo carni','frigorifero',0,4),('Frigo latticini','frigorifero',0,4),('Frigo verdure','frigorifero',2,8),('Congelatore','congelatore',-25,-18),('Cella','frigorifero',0,4);
INSERT INTO registro_temperature (punto_controllo_id, data_ora, temperatura, esito) VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),3.0,'conforme'),(2,strftime('%Y-%m-%dT%H:%M:%fZ','now'),3.5,'conforme'),(3,strftime('%Y-%m-%dT%H:%M:%fZ','now'),5.0,'conforme');
INSERT INTO aree_pulizia (nome, frequenza) VALUES ('Piano di lavoro','giornaliera'),('Affettatrice','giornaliera'),('Pavimento cucina','giornaliera'),('Cappa','settimanale');
INSERT INTO registro_sanificazione (area_id, data_ora) VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),(3,strftime('%Y-%m-%dT%H:%M:%fZ','now')),(4,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO preferenze (chiave, valore) VALUES ('backup_cartella','content://x'),('backup_ultimo',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('backup_esterno_ultimo',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO menu_dati (chiave, valore) VALUES ('state','{"v":3,"templates":[{"id":"t1","heading":"Menù di domenica"}],"menus":[{"id":"m1","templateId":"t1","date":"2026-10-17","client":"Rossi","heading":"Battesimo","guests":60,"status":"confermata"}]}');
INSERT INTO fornitori (ragione_sociale) VALUES ('Altasfera');
INSERT INTO prodotti (denominazione, categoria) VALUES ('Burrata','Latticini'),('Semola rimacinata','Secco/Dispensa'),('Agnello','Carne');
INSERT INTO lotti (prodotto_id, fornitore_id, numero_lotto, data_ricevimento, quantita_iniziale, quantita_residua, unita_misura, data_scadenza) VALUES
 (1,1,'L2410',strftime('%Y-%m-%dT%H:%M:%fZ','now'),4,2.5,'kg',date('now','+1 day')),(2,1,'S881',strftime('%Y-%m-%dT%H:%M:%fZ','now'),10,6,'kg',date('now','+90 day')),(3,1,'A77',strftime('%Y-%m-%dT%H:%M:%fZ','now'),18,18,'kg',date('now','+4 day'));
