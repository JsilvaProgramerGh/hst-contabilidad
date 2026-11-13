# Proformas de proveedores

En **Cotización → Detalle → Proformas de proveedores**, ingresa la clave del módulo. Usa **Pegar proforma**, revisa las ofertas y registra la fuente. Después puedes buscar por nombre, código o proveedor, comparar desde una oferta y agregar el producto a la cotización. Los costos quedan en el historial. El precio de venta de la línea agregada queda vacío y editable. **Pegar productos** conserva su formato y comportamiento.

## Formato para pedir a ChatGPT

Devuelve TSV con los dos encabezados siguientes, una fila de proveedor entre ambos y una fila por producto. Conserva códigos, textos y precios de la fuente. No inventes datos. Deja la celda vacía y conserva su tabulación si falta un dato. Usa una línea por producto. Las fechas usan AAAA-MM-DD y la moneda un código como USD. En Base IVA escribe con IVA o sin IVA solo cuando la fuente lo indique. En Contenido indica cuántas unidades base hay por presentación cobrada. Para una caja de diez matraces, escribe Caja de 10, 10 y unidad en las tres columnas correspondientes. Para un precio por matraz, escribe Unidad, 1 y unidad. Conserva notas de disponibilidad. Usa disponible o no disponible cuando el estado sea explícito y esa palabra sea suficiente. Usa precios sin símbolo monetario y evita separadores ambiguos como 1.234.

Ejemplo sintético, únicamente para verificar el formato:

```tsv
Proveedor	RUC	Referencia	Fecha	Válida hasta	Validez (días)	Moneda	Base IVA
Proveedor de ejemplo		4389	2026-11-10		15	USD	sin IVA
Código	Producto	Descripción	Cantidad	Presentación	Contenido	Unidad base	Precio unitario	Disponibilidad
00017	Matraz 100 mL borosilicato		2	Caja de 10	10	unidad	24,50	disponible
```

La búsqueda de similares conserva las ofertas originales. Los nombres normalizados, las referencias del proveedor y los vínculos confirmados ayudan a encontrar candidatos. El costo por unidad base se compara solo para una coincidencia normalizada o una variante confirmada, con moneda, base IVA, unidad base y contenido comparables. El menor costo excluye ofertas vencidas y ofertas expresamente no disponibles. La disponibilidad y la vigencia desconocidas siguen visibles. El stock propio se muestra cuando existe un vínculo confirmado con la variante y el inventario tiene un dato.

## Despliegue

1. En staging, verifica que public.inv_suppliers.id sea UUID, y aplica docs/supplier-proformas.sql. La migración crea el historial y dos RPC de uso exclusivo del rol de servicio.
2. Configura SUPPLIER_PROFORMAS_ACCESS_KEY en Vercel como secreto de servidor aleatorio de alta entropía (al menos 32 caracteres). Entrega la clave a operadores autorizados mediante un canal privado. El módulo usa la clave en memoria y la vuelve a pedir al cerrar y abrir. Las cotizaciones normales mantienen su flujo de acceso.
3. Valida la importación, búsqueda, comparación y adición a cotización en Preview con datos sintéticos. Luego aplica la migración en producción y publica la aplicación con el secreto configurado. Usa las credenciales Supabase de servidor ya configuradas.
