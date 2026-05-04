# HST Mi Negocio - Roadmap de reconstruccion

## Regla principal
- No borrar ni alterar historicos de `transactions`, `facturas`, `pagos_factura` ni movimientos ya registrados.
- La reconstruccion debe montarse sobre datos existentes y migraciones nuevas, no sobre reinicios.

## Vision del producto
Convertir HST Contabilidad en la app web interna de la empresa: inventario, clientes, cotizaciones, ventas, facturacion electronica, cuentas por cobrar, compras, caja, IVA y reportes.

## Modulos objetivo
1. Dashboard `Mi negocio`
   - Resumen del dia, semana y mes
   - Caja, ventas, compras, cuentas por cobrar, stock critico e IVA

2. Catalogo e inventario
   - Producto base: por ejemplo `Guantes`
   - Variantes claras por atributos: color, talla, grosor, presentacion, tipo, marca opcional
   - SKU interno, unidad, stock, stock minimo, costo, PVP, impuestos, estado
   - Historial de entradas, salidas, ajustes y compras

3. Clientes
   - Base de datos reutilizable para cotizaciones, ventas y facturacion
   - Cedula/RUC, razon social o nombre, correo, telefono, direccion, notas
   - Busqueda rapida y autocompletado

4. Cotizaciones
   - Crear cotizacion desde clientes existentes
   - Convertir cotizacion a venta o factura
   - PDF profesional con branding de la empresa
   - Historial, duplicar, estado y seguimiento

5. Ventas y facturacion
   - Venta rapida desde inventario
   - Factura electronica desde la app
   - Emision XML, PDF tipo RIDE, estados de recepcion/autorizacion y envio por correo
   - Archivos y trazabilidad por comprobante

6. Compras y proveedores
   - Proveedores, facturas de compra, costos por presentacion, costo promedio y ultima compra
   - Impacto automatico en stock y contabilidad

7. Contabilidad operativa
   - Ingresos y gastos
   - Cuentas por cobrar
   - IVA generado e IVA credito
   - Reportes por rango de fechas

## Modelo de catalogo propuesto
- `catalog_products`
  - nombre comercial del producto base
  - categoria/subcategoria
  - descripcion general
  - activo

- `catalog_attributes`
  - clave del atributo: color, talla, grosor, presentacion, marca, material
  - tipo de entrada
  - orden

- `catalog_product_variants`
  - referencia al producto base
  - combinacion normalizada de atributos
  - nombre legible autogenerado
  - SKU interno unico
  - codigo de barras opcional
  - costo actual
  - precio de venta
  - stock actual
  - stock minimo
  - impuesto IVA
  - activo

- `inventory_movements`
  - entrada, salida, ajuste, compra, venta, anulacion
  - referencia cruzada al documento origen

## Modelo comercial propuesto
- `customers`
- `customer_tax_profiles`
- `quotes`
- `quote_items`
- `sales_orders`
- `sales_order_items`
- `electronic_invoices`
- `electronic_invoice_items`
- `electronic_invoice_events`
- `accounts_receivable_payments`

## Fases de reconstruccion
### Fase 1 - Base segura
- Redisenar navegacion y shell principal `Mi negocio`
- Consolidar tipos y helpers de Supabase
- Crear base de clientes
- Rehacer catalogo y variantes sin tocar historicos

### Fase 2 - Operacion diaria
- Rehacer compras, stock, POS y cotizaciones sobre nuevo modelo
- Autocompletado de clientes y productos
- Mejorar reportes y dashboard

### Fase 3 - Facturacion electronica
- Preparar modulo de facturacion SRI
- XML firmado, RIDE PDF, eventos y correo profesional
- Integracion con autorizacion y consulta de comprobantes

### Fase 4 - Cierre administrativo
- IVA, cuentas por cobrar, reportes gerenciales y exportaciones

## Decisiones de producto tomadas desde ahora
- Marca opcional en variantes: ayuda a identificar, pero no sera obligatoria para todos los productos.
- Variantes por atributos: color, talla y grosor deben ser de primera clase para evitar confusiones.
- Clientes reutilizables: no volver a llenar los datos cada vez.
- Historial contable actual se conserva.

## Primera entrega de codigo
1. Nuevo dashboard `Mi negocio`
2. Modulo de clientes
3. Nuevo catalogo de productos con variantes y atributos
4. Base para usar clientes en cotizaciones
