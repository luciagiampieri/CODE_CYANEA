# Room busca WorkDatabase_Impl y su constructor sin argumentos por reflexion.
# R8 debe conservar ambas clases para el inicio automatico de WorkManager.
-keep class androidx.work.impl.WorkDatabase { *; }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
