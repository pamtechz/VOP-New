import React, { useState } from 'react';
import { BookResource } from '../types';
import { ArrowLeft, BookOpen, Search } from 'lucide-react';

interface ResourcesPageProps {
  books: BookResource[];
  onBack: () => void;
}

export const ResourcesPage: React.FC<ResourcesPageProps> = ({ books, onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = ['All', ...Array.from(new Set(books.map(b => b.category)))];

  const filteredBooks = books.filter(b => {
    const matchesCategory = selectedCategory === 'All' || b.category === selectedCategory;
    const matchesQuery =
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800 pb-24 md:pb-12">
      {/* Top Banner - Deep Royal Blue (#002d72) Matching Original APK */}
      <div className="bg-[#002d72] text-white pt-5 pb-6 px-4 sm:px-6 shadow-md">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-white/90 hover:text-white transition-colors cursor-pointer py-1"
            >
              <ArrowLeft size={22} />
              <span className="font-bold text-base sm:text-lg">Christian Library</span>
            </button>
            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/15 text-amber-300 border border-white/20">
              Spiritual Books & E-Books
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Spirit of Prophecy & Bible Study Library
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-0.5">
                Deepen your Christian walk with inspired books and study guides.
              </p>
            </div>

            {/* Search Box */}
            <div className="w-full sm:w-72 relative">
              <input
                type="text"
                placeholder="Search titles or authors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-9 rounded-full bg-white/15 border border-white/30 text-white placeholder-blue-200 text-xs focus:bg-white focus:text-slate-900 focus:placeholder-slate-400 focus:outline-none transition-colors"
              />
              <Search size={14} className="absolute left-3 top-2.5 text-blue-200" />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 mt-5 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  selectedCategory === category
                    ? 'bg-[#ff9900] text-white shadow-xs'
                    : 'bg-white/15 border border-white/25 text-white hover:bg-white/25'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Book Grid */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {filteredBooks.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <p className="text-slate-500 text-sm">No books found matching your criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredBooks.map((book) => (
              <div
                key={book.id}
                className="flex flex-col bg-white border border-slate-200/80 rounded-2xl p-5 hover:border-slate-300 hover:shadow-md transition-all group"
              >
                <div className="flex gap-3.5 mb-3.5">
                  <div className="w-20 h-28 flex-shrink-0 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center p-2 shadow-xs">
                    <img
                      src={book.imageUrl || '/assets/book.png'}
                      alt={book.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#002d72] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 inline-block mb-1">
                      {book.category}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">{book.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">By {book.author}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed flex-1">
                  {book.description}
                </p>

                <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                    <span>✓</span> Free Study Resource
                  </span>
                  <button
                    onClick={() => {
                      alert(`Reading "${book.name}" offline study edition.`);
                    }}
                    className="px-4 py-1.5 rounded-full bg-[#002d72] hover:bg-[#002257] text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Read Online
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
