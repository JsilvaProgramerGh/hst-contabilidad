# Consulta de cédula o RUC

El botón de cotizaciones llama `POST /api/clientes/consultar` únicamente al pulsarlo. Una cédula de 10 dígitos consulta su posible RUC con sufijo 001; no presupone que toda cédula tenga RUC. La identificación escrita se conserva. El servidor consulta el endpoint público de SRI en Línea `sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc` y exige coincidencia exacta de los 13 dígitos antes de usar el resultado.

Se autocompleta la razón social o nombre que devuelve el SRI. Estado y actividad aparecen junto al resultado. La fuente no proporciona teléfono, correo ni dirección en esta respuesta; no se inventan ni se sobrescriben esos campos. No se devuelven representantes legales ni sus identificaciones. La consulta no guarda clientes ni cotizaciones; se mantienen los controles de guardado existentes.

Si la fuente no responde o no tiene un resultado, se busca en los clientes guardados, identificando ese resultado expresamente como HST. Sin coincidencia se permite continuar manualmente. Un cambio de identificación, nombre o cliente cancela la solicitud pendiente. No se aplican respuestas obsoletas sobre una edición manual.

El servicio se consulta sin credenciales, sin resolver ni eludir CAPTCHA y con un tiempo máximo de 10 segundos. Si el SRI exige una verificación o cambia la respuesta, se informa de indisponibilidad en vez de simular una coincidencia. Las respuestas no se almacenan en cachés públicas. Hay un límite básico y acotado de 15 consultas por minuto por IP en cada instancia; no sustituye un limitador distribuido.

Verificación: parser con coincidencias exactas, resultados vacíos, ambiguos y errores de proveedor; navegador con cancelación y conservación de campos; consulta real de la razón social del RUC proporcionado por el usuario. No se requieren migraciones ni claves adicionales.
