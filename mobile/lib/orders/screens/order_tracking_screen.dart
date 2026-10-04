import 'package:flutter/material.dart';

class OrderTrackingScreen extends StatelessWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext themeContext) {
    final theme = Theme.of(themeContext);

    final Map<String, dynamic> orderDetails = {
      'parent_ref': 'ORD-2610-A8J4P',
      'created_at': '2026-10-04 14:30',
      'status': 'processing',
      'total_amount': 1700.00,
      'buyer_name': 'John Doe',
      'shipping_address': 'Plot 42, Independence Avenue, Woodlands, Lusaka',
      'seller_orders': [
        {
          'public_ref': 'SORD-2610-S812A',
          'store_name': 'Alpha Electronics',
          'subtotal': 1250.00,
          'status': 'processing',
          'item': 'Wireless Noise Cancelling Headphones (x1)',
        },
        {
          'public_ref': 'SORD-2610-S812B',
          'store_name': 'Beta Crafts',
          'subtotal': 450.00,
          'status': 'shipped',
          'item': 'Handcrafted Leather Crossbody Bag (x1)',
        },
      ]
    };

    return Scaffold(
      appBar: AppBar(
        title: const Text('Order & Delivery Tracking'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Order Reference Banner
            Card(
              color: theme.colorScheme.primaryContainer,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('ORDER REFERENCE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
                        Text(orderDetails['parent_ref'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        Text(orderDetails['created_at'], style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                    Text(
                      'K${orderDetails['total_amount'].toStringAsFixed(2)}',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: theme.colorScheme.primary),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Delivery Status Timeline
            Text('Delivery Progress', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            _buildTimelineStep('Order Placed', 'Payment authorized and order confirmed', true),
            _buildTimelineStep('Processing by Sellers', 'Sellers are packing your items', true),
            _buildTimelineStep('Out for Delivery', 'Local courier dispatched', false),
            _buildTimelineStep('Delivered', 'Item handed to recipient', false),
            const SizedBox(height: 24),

            // Seller Sub-Orders Breakdown
            Text('Seller Sub-Orders (${orderDetails['seller_orders'].length})', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            ... (orderDetails['seller_orders'] as List).map((so) {
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(12.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(so['store_name'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: so['status'] == 'shipped' ? Colors.blue.shade100 : Colors.amber.shade100,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              so['status'].toUpperCase(),
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: so['status'] == 'shipped' ? Colors.blue.shade800 : Colors.amber.shade900,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(so['item'], style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      Text('Ref: ${so['public_ref']}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                    ],
                  ),
                ),
              );
            }).toList(),
          ],
        ),
      ),
    );
  }

  Widget _buildTimelineStep(String title, String subtitle, bool isCompleted) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isCompleted ? Icons.check_circle : Icons.radio_button_unchecked,
            color: isCompleted ? const Color(0xFF10B981) : Colors.grey,
            size: 20,
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: isCompleted ? Colors.white : Colors.grey,
                ),
              ),
              Text(subtitle, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            ],
          ),
        ],
      ),
    );
  }
}
